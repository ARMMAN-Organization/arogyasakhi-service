import { notFound } from '@armman/service-commons';
import type { ApprovalRequestRepository } from './approvalRequest.repository';
import type { CreateApprovalRequestInput } from './dto/create-approvalRequest.dto';
import type { SakhiClient } from '../quick-response/sakhi.client';
import type { BeneficiaryClient } from '../quick-response/beneficiary.client';
import type { NotificationClient } from '../quick-response/notification.client';

const REQUEST_TYPE_LABELS: Record<CreateApprovalRequestInput['requestType'], string> = {
  LMP_CHANGE: 'LMP change request',
  REFERRAL_INCOMPLETE: 'Referral incomplete review',
  ACCOMPANIED_REFERRAL: 'Accompanied referral proof',
  CLOSURE_REVIEW: 'Closure form review',
  REOPEN: 'Beneficiary reopen request',
  DATA_RESTORE: 'Data restore request',
  TRANSFER: 'Transfer request',
};

/** Approval request domain logic. Data access is delegated to the repository. */
export class ApprovalRequestService {
  constructor(
    private readonly repository: ApprovalRequestRepository,
    private readonly sakhiClient: SakhiClient,
    private readonly beneficiaryClient: BeneficiaryClient,
    private readonly notificationClient: NotificationClient,
  ) {}

  list() {
    return this.repository.findMany();
  }

  /**
   * Resolves the approval_requests row raised for a given closure — used by
   * closure-reopen-service to recover the id it needs to link a Closure
   * Review decision notification back to its Quick Response card (see
   * getCardDetail's cardId, which is this id, not the closures row id).
   */
  async findByClosureId(closureId: string) {
    const row = await this.repository.findByClosureId(closureId);
    if (!row) throw notFound('No approval request found for this closure.');
    return row;
  }

  /** Same as findByClosureId, for REOPEN cards. */
  async findByReopenRequestId(reopenRequestId: string) {
    const row = await this.repository.findByReopenRequestId(reopenRequestId);
    if (!row) throw notFound('No approval request found for this reopen request.');
    return row;
  }

  async create(dto: CreateApprovalRequestInput, authorizationHeader: string) {
    const created = await this.repository.create(dto);
    // Fired without awaiting — the row is already committed, and
    // notifySupervisor's own try/catch means this never rejects. Awaiting it
    // would hold the HTTP response open for up to 3 chained downstream calls
    // (Sakhi lookup -> beneficiary lookup -> notify), risking a client/
    // gateway timeout-and-retry that creates a duplicate row for the same
    // submission.
    void this.notifySupervisor(created.id, dto, authorizationHeader);
    return created;
  }

  /**
   * Best-effort: notifies the Sakhi's assigned Supervisor that a new
   * approval request needs review. Failures here (Sakhi/beneficiary lookup
   * down, no assigned Supervisor, notification-escalation-service
   * unreachable) are logged, never thrown — the approval request row is
   * already committed by the time this runs and must not be rolled back or
   * have its creation blocked by this.
   */
  private async notifySupervisor(
    approvalRequestId: string,
    dto: CreateApprovalRequestInput,
    authorizationHeader: string,
  ): Promise<void> {
    try {
      const sakhi = await this.sakhiClient.getById(dto.requestedByUserId, authorizationHeader);
      if (!sakhi?.supervisorId || sakhi.supervisorId === dto.requestedByUserId) return;

      const beneficiary = dto.beneficiaryId
        ? await this.beneficiaryClient
            .getById(dto.beneficiaryId, authorizationHeader)
            .catch(() => null)
        : null;

      const label = REQUEST_TYPE_LABELS[dto.requestType];
      const beneficiaryName = beneficiary?.pii.fullName ?? null;
      const body = beneficiaryName
        ? `${sakhi.displayName} submitted a ${label.toLowerCase()} for ${beneficiaryName}.`
        : `${sakhi.displayName} submitted a ${label.toLowerCase()}.`;

      await this.notificationClient.notify(
        sakhi.supervisorId,
        'SUPERVISOR_APPROVAL_REQUESTED',
        `${label} submitted`,
        body,
        authorizationHeader,
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: approvalRequestId },
      );
    } catch (err) {
      console.error(
        `Failed to notify the Supervisor of approval request ${approvalRequestId}:`,
        err,
      );
    }
  }
}
