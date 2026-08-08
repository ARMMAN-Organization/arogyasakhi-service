import { conflict, notFound, unprocessable } from '@armman/service-commons';
import type { ClosureRepository } from './closure.repository';
import type { ApprovalClient } from '../reopen-requests/approval.client';
import type { LookupClient } from '../reopen-requests/lookup.client';
import type { NotificationClient } from '../reopen-requests/notification.client';
import type { CreateClosureInput } from './dto/create-closure.dto';
import type { DecideClosureInput } from './dto/decide-closure.dto';

/** Closure domain logic. Data access is delegated to the repository. */
export class ClosureService {
  constructor(
    private readonly repository: ClosureRepository,
    private readonly approvalClient: ApprovalClient,
    private readonly lookupClient: LookupClient,
    private readonly notificationClient: NotificationClient,
  ) {}

  list() {
    return this.repository.findMany();
  }

  /**
   * Creates the closure and, only when it needs supervisor review
   * (supervisorStatus is set — per the schema, only MIGRATION-reason
   * closures), also raises the matching CLOSURE_REVIEW Quick Response card
   * in approval-service (FR-SV-4.4). A failure raising the card is logged
   * and tolerated rather than failing an already-successful closure
   * submission — same tolerance reopen-request.service.ts's create() uses.
   */
  async create(dto: CreateClosureInput, authorizationHeader: string) {
    const created = await this.repository.create(dto);

    if (created.supervisorStatus === 'PENDING') {
      try {
        const decisionStatusLookupId = await this.lookupClient.resolveApprovalStatusId(
          'PENDING',
          authorizationHeader,
        );
        if (decisionStatusLookupId) {
          await this.approvalClient.create(
            {
              requestType: 'CLOSURE_REVIEW',
              beneficiaryId: created.beneficiaryId,
              sourceEntityType: 'Closure',
              sourceEntityId: created.id,
              closureId: created.id,
              requestedByUserId: created.submittedByUserId,
              decisionStatusLookupId,
            },
            authorizationHeader,
          );
        } else {
          console.error(
            `Closure ${created.id} was created but no PENDING APPROVAL_STATUS lookup value was found — Quick Response card not raised.`,
          );
        }
      } catch (err) {
        console.error(
          `Closure ${created.id} was created but raising its Quick Response card failed:`,
          err,
        );
      }
    }

    return created;
  }

  /**
   * Decides a pending closure review (FR-SV-4.4). Approve/Reject both flip
   * supervisorStatus here — the "beneficiary moves to Closed/Open list"
   * consequence lives in beneficiary-service, out of this service's
   * ownership (forklift rule). The Sakhi notification is best-effort — its
   * failure doesn't fail an already-committed decision.
   */
  async decide(
    id: string,
    decidedBySupervisorId: string,
    dto: DecideClosureInput,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Closure not found.');
    if (existing.supervisorStatus === null) {
      throw unprocessable('This closure does not require supervisor review.');
    }
    if (existing.supervisorStatus !== 'PENDING') {
      throw conflict('This closure has already been decided.');
    }

    const updated = await this.repository.decide(id, decidedBySupervisorId, dto);
    if (!updated) {
      // Raced with another decision between the read above and the
      // conditional update — same outcome as the check above, just caught a
      // beat later instead of trusting a stale read.
      throw conflict('This closure has already been decided.');
    }

    const decided = await this.repository.findById(id);

    try {
      await this.notificationClient.notify(
        existing.submittedByUserId,
        'CLOSURE_REVIEW_UPDATE',
        'Closure review decided',
        dto.decision === 'APPROVED'
          ? 'Your closure request was approved.'
          : 'Your closure request was rejected.',
        authorizationHeader,
      );
    } catch (err) {
      console.error(
        `Closure ${id} was decided (${dto.decision}) but the Sakhi notification failed:`,
        err,
      );
    }

    return decided;
  }
}
