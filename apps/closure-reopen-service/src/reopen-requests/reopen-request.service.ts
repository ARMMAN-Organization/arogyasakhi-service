import { conflict, notFound } from '@armman/service-commons';
import type { ReopenRequestRepository } from './reopen-request.repository';
import type { AuditClient } from './audit.client';
import type { NotificationClient } from './notification.client';
import type { ApprovalClient } from './approval.client';
import type { LookupClient } from './lookup.client';
import type { BeneficiaryClient } from './beneficiary.client';
import type { SakhiClient } from './sakhi.client';
import type { CreateReopenRequestInput } from './dto/create-reopen-request.dto';
import type { DecideReopenRequestInput } from './dto/decide-reopen-request.dto';

/** Narrows a caught Prisma error to a unique-constraint violation (P2002). */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

/** Reopen request domain logic. Data access is delegated to the repository. */
export class ReopenRequestService {
  constructor(
    private readonly repository: ReopenRequestRepository,
    private readonly auditClient: AuditClient,
    private readonly notificationClient: NotificationClient,
    private readonly approvalClient: ApprovalClient,
    private readonly lookupClient: LookupClient,
    private readonly beneficiaryClient: BeneficiaryClient,
    private readonly sakhiClient: SakhiClient,
  ) {}

  /** Best-effort — a name lookup failure falls back to no name (generic
   * notification text) rather than blocking the decision it's attached to. */
  private async resolveSakhiName(
    sakhiId: string,
    authorizationHeader: string,
  ): Promise<string | null> {
    try {
      const sakhi = await this.sakhiClient.getById(sakhiId, authorizationHeader);
      return sakhi?.displayName ?? null;
    } catch (err) {
      console.error(`Failed to resolve Sakhi ${sakhiId}'s name for a notification:`, err);
      return null;
    }
  }

  /**
   * Best-effort — this reopen request's Quick Response card id
   * (approval_requests.id), used to link the decision notification so
   * GET /quick-response/:cardId can resolve it. A failure here (no matching
   * approval request, or approval-service unreachable) must not block the
   * decision — the notification is simply sent without a linkedEntity rather
   * than with a reopen_requests-table id GET /quick-response/:cardId doesn't
   * recognise.
   */
  private async resolveQuickResponseCardId(
    reopenRequestId: string,
    authorizationHeader: string,
  ): Promise<string | null> {
    try {
      const approvalRequest = await this.approvalClient.findByReopenRequestId(
        reopenRequestId,
        authorizationHeader,
      );
      return approvalRequest?.id ?? null;
    } catch (err) {
      console.error(
        `Failed to resolve the Quick Response card id for reopen request ${reopenRequestId}:`,
        err,
      );
      return null;
    }
  }

  /**
   * All reopen requests for one beneficiary, most-recent first — for the
   * app's "Reopen pending review" state (any entry with
   * supervisorStatus: 'PENDING'), which currentStatus alone can't show since
   * a beneficiary stays CLOSED for the entire time a reopen request is
   * pending, only flipping to ACTIVE on approval.
   *
   * Delegates ownership scoping to beneficiary-service's own
   * GET /beneficiaries/:id (SAKHI-own-case / SUPERVISOR-roster /
   * MANAGER-unrestricted) rather than duplicating that IDOR check here —
   * this service owns no sakhiId data of its own. A 403/404 from that call
   * propagates as-is; only on success does this query reopen_requests.
   */
  async listByBeneficiaryId(beneficiaryId: string, authorizationHeader: string) {
    await this.beneficiaryClient.getById(beneficiaryId, authorizationHeader);
    return this.repository.findByBeneficiaryId(beneficiaryId);
  }

  getDecisionStatusByIds(ids: string[]) {
    return this.repository.findManyByIds(ids);
  }

  async getById(id: string) {
    const reopenRequest = await this.repository.findById(id);
    if (!reopenRequest) throw notFound('Reopen request not found.');
    return reopenRequest;
  }

  /**
   * Raises a Sakhi's reopen request (FR-S-10.3) and, on success, raises the
   * matching REOPEN Quick Response card in approval-service. The reopen
   * request is the source of truth — a failure raising the card is logged
   * and tolerated rather than failing an already-successful submission
   * (same tolerance the decide() audit/notification calls use).
   *
   * Idempotent replay: a dropped-connection retry resubmits the same
   * client-generated localReopenRequestUuid. Return the original request
   * unchanged instead of creating a duplicate row or re-firing the Quick
   * Response card a second time — this mobile flow is offline-first and
   * expected to retry, same as closures' localClosureUuid.
   *
   * A concurrent retry racing on the same localReopenRequestUuid (two near-
   * simultaneous requests both passing the findByLocalReopenRequestUuid
   * check as null) hits the column's own unique constraint on create() —
   * caught here and turned into the same idempotent-replay result as a
   * sequential retry, rather than a raw 500.
   */
  async create(
    dto: CreateReopenRequestInput,
    requestedByUserId: string,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findByLocalReopenRequestUuid(dto.localReopenRequestUuid);
    if (existing) return existing;

    let created;
    try {
      created = await this.repository.create({ ...dto, requestedByUserId });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        const winner = await this.repository.findByLocalReopenRequestUuid(
          dto.localReopenRequestUuid,
        );
        if (winner) return winner;
      }
      throw err;
    }

    try {
      const decisionStatusLookupId = await this.lookupClient.resolveApprovalStatusId(
        'PENDING',
        authorizationHeader,
      );
      if (decisionStatusLookupId) {
        await this.approvalClient.create(
          {
            requestType: 'REOPEN',
            beneficiaryId: created.beneficiaryId,
            sourceEntityType: 'ReopenRequest',
            sourceEntityId: created.id,
            reopenRequestId: created.id,
            requestedByUserId,
            decisionStatusLookupId,
          },
          authorizationHeader,
        );
      } else {
        console.error(
          `Reopen request ${created.id} was created but no PENDING APPROVAL_STATUS lookup value was found — Quick Response card not raised.`,
        );
      }
    } catch (err) {
      console.error(
        `Reopen request ${created.id} was created but raising its Quick Response card failed:`,
        err,
      );
    }

    return created;
  }

  /**
   * Decides a Supervisor's reopen request (Quick Response's REOPEN card).
   * REJECTED is the persisted "Cannot re-open" state — the beneficiary
   * simply stays whatever Closed state it already had; no separate flag.
   *
   * On APPROVED, also reactivates the beneficiary case (FR-SV-4.7's
   * "Beneficiary is added to Sakhi's Open beneficiary list") via
   * beneficiary-service. This call is best-effort (logged, not thrown) —
   * `repository.decide()` just above already committed
   * `supervisorStatus = 'APPROVED'`, and this method's own guard
   * (`supervisorStatus !== 'PENDING'`) means a reopen request can never be
   * decided a second time to retry just this step; any retry attempt 409s
   * immediately. Letting this call fail the whole request would leave the
   * request stuck showing APPROVED with the beneficiary still CLOSED and no
   * way to fix it except a direct beneficiary-service call — same failure
   * shape as the audit/notification calls below, so it's tolerated the same
   * way, with a distinct log line calling out that this one needs manual
   * follow-up, not just a shrug.
   *
   * Writes the audit_log entry and notifies the Sakhi here, not in
   * approval-service's Quick Response layer — this endpoint is the only
   * place a reopen decision is actually persisted (Quick Response is one
   * caller of it, not the only one), so the audit trail can't be bypassed
   * by calling this endpoint directly.
   *
   * Also re-checks ownership scoping against beneficiary-service before
   * touching supervisorStatus — same roster check create() relies on,
   * closing the gap where a SUPERVISOR who merely learns a reopen request id
   * outside their own roster could otherwise decide it.
   */
  async decide(
    id: string,
    decidedByUserId: string,
    dto: DecideReopenRequestInput,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Reopen request not found.');

    // Delegates ownership scoping to beneficiary-service's own GET
    // /beneficiaries/:id (SAKHI-own-case / SUPERVISOR-roster /
    // MANAGER-unrestricted) — same pattern create() already uses. Without
    // this, any SUPERVISOR who learns a reopen request id outside their own
    // roster could approve or reject it (IDOR). Its response is also reused
    // below for the Sakhi notification's beneficiary name, avoiding a
    // second fetch.
    const beneficiary = await this.beneficiaryClient.getById(
      existing.beneficiaryId,
      authorizationHeader,
    );

    if (existing.supervisorStatus !== 'PENDING') {
      throw conflict('This reopen request has already been decided.');
    }

    const updated = await this.repository.decide(id, decidedByUserId, dto);
    if (!updated) {
      // Raced with another decision between the read above and the
      // conditional update — same outcome as the check above, just caught a
      // beat later instead of trusting a stale read.
      throw conflict('This reopen request has already been decided.');
    }

    if (dto.decision === 'APPROVED') {
      try {
        await this.beneficiaryClient.reactivateCase(existing.beneficiaryId, authorizationHeader);
      } catch (err) {
        console.error(
          `Reopen request ${id} was approved but reactivating beneficiary ` +
            `${existing.beneficiaryId} failed (this request cannot be re-decided to retry — ` +
            `needs manual follow-up):`,
          err,
        );
      }
    }

    const decided = await this.repository.findById(id);

    // The decision above is already committed. A failure notifying the Sakhi
    // or writing the audit entry must not turn an already-successful decision
    // into an error response to the caller — log it and move on instead.
    try {
      await this.auditClient.log(
        decidedByUserId,
        `QUICK_RESPONSE_${dto.decision === 'APPROVED' ? 'APPROVE' : 'REJECT'}`,
        'ReopenRequest',
        id,
        { decision: dto.decision, decisionNotes: dto.decisionNotes ?? null },
        authorizationHeader,
      );
      const [sakhiName, cardId] = await Promise.all([
        this.resolveSakhiName(existing.requestedByUserId, authorizationHeader),
        this.resolveQuickResponseCardId(id, authorizationHeader),
      ]);
      const beneficiaryName = beneficiary?.pii.fullName ?? null;
      await this.notificationClient.notify(
        existing.requestedByUserId,
        'REOPEN_UPDATE',
        sakhiName ? `Reopen request — ${sakhiName}` : 'Reopen request decided',
        beneficiaryName
          ? dto.decision === 'APPROVED'
            ? `${beneficiaryName}'s reopen request was approved`
            : `${beneficiaryName}'s reopen request was rejected`
          : dto.decision === 'APPROVED'
            ? 'Your reopen request was approved.'
            : 'Your reopen request was rejected.',
        authorizationHeader,
        cardId ? { linkedEntityType: 'QuickResponseCard', linkedEntityId: cardId } : undefined,
      );
    } catch (err) {
      console.error(
        `Reopen request ${id} was decided (${dto.decision}) but the audit entry or Sakhi notification failed:`,
        err,
      );
    }

    return decided;
  }
}
