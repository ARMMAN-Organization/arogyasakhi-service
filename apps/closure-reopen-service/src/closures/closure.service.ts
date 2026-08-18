import { conflict, notFound, unprocessable } from '@armman/service-commons';
import type { ClosureRepository } from './closure.repository';
import type { ApprovalClient } from '../reopen-requests/approval.client';
import type { LookupClient } from '../reopen-requests/lookup.client';
import type { NotificationClient } from '../reopen-requests/notification.client';
import type { BeneficiaryClient } from '../reopen-requests/beneficiary.client';
import type { CreateClosureInput } from './dto/create-closure.dto';
import type { DecideClosureInput } from './dto/decide-closure.dto';

/** Closure domain logic. Data access is delegated to the repository. */
export class ClosureService {
  constructor(
    private readonly repository: ClosureRepository,
    private readonly approvalClient: ApprovalClient,
    private readonly lookupClient: LookupClient,
    private readonly notificationClient: NotificationClient,
    private readonly beneficiaryClient: BeneficiaryClient,
  ) {}

  list() {
    return this.repository.findMany();
  }

  /**
   * Idempotent replay: a dropped-connection retry of a Sakhi's closure
   * submission resubmits the same client-generated localClosureUuid. Return
   * the original closure unchanged instead of creating a duplicate row or
   * re-firing the Quick Response card / beneficiary-close side effects below
   * a second time — this mobile flow is offline-first and expected to retry.
   */
  async create(dto: CreateClosureInput, authorizationHeader: string) {
    const existing = await this.repository.findByLocalClosureUuid(dto.localClosureUuid);
    if (existing) return existing;

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
    } else {
      // No supervisor review needed (MEDICAL/NON_MEDICAL/PROGRAM_COMPLETION)
      // — close the beneficiary right away instead of waiting on a decision
      // that will never come. Best-effort/tolerated, same stance as the
      // Quick Response card raise above: the closures row is already the
      // source of truth for this submission having happened.
      try {
        await this.beneficiaryClient.closeCase(
          created.beneficiaryId,
          created.closureType,
          authorizationHeader,
        );
      } catch (err) {
        console.error(
          `Closure ${created.id} was created but closing beneficiary ${created.beneficiaryId} failed:`,
          err,
        );
      }
    }

    return created;
  }

  /**
   * Decides a pending closure review (FR-SV-4.4). Approve/Reject both flip
   * supervisorStatus here. On APPROVED, also closes the beneficiary case via
   * beneficiary-service (the "beneficiary moves to the Closed list"
   * consequence — out of this service's own ownership per the forklift
   * rule). REJECTED leaves the beneficiary exactly as it was — same
   * "rejection changes nothing beyond the closures row" contract
   * reopen-request.service.ts's decide() uses for a rejected reopen.
   *
   * The beneficiary-close call is best-effort (logged, not thrown) — the
   * decision above is already committed, and this method's own guard
   * (supervisorStatus !== 'PENDING') means a closure can never be decided a
   * second time to retry just this step; same tolerance/manual-follow-up
   * stance as reopen-request.service.ts's decide() uses for reactivateCase.
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

    if (dto.decision === 'APPROVED') {
      try {
        await this.beneficiaryClient.closeCase(
          existing.beneficiaryId,
          existing.closureType,
          authorizationHeader,
        );
      } catch (err) {
        console.error(
          `Closure ${id} was approved but closing beneficiary ${existing.beneficiaryId} ` +
            `failed (this closure cannot be re-decided to retry — needs manual follow-up):`,
          err,
        );
      }
    }

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
