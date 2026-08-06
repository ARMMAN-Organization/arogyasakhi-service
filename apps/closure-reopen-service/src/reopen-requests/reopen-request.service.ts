import { conflict, notFound } from '@armman/service-commons';
import type { ReopenRequestRepository } from './reopen-request.repository';
import type { AuditClient } from './audit.client';
import type { NotificationClient } from './notification.client';
import type { DecideReopenRequestInput } from './dto/decide-reopen-request.dto';

/** Reopen request domain logic. Data access is delegated to the repository. */
export class ReopenRequestService {
  constructor(
    private readonly repository: ReopenRequestRepository,
    private readonly auditClient: AuditClient,
    private readonly notificationClient: NotificationClient,
  ) {}

  /**
   * Decides a Supervisor's reopen request (Quick Response's REOPEN card).
   * REJECTED is the persisted "Cannot re-open" state — the beneficiary
   * simply stays whatever Closed state it already had; no separate flag.
   *
   * Writes the audit_log entry and notifies the Sakhi here, not in
   * approval-service's Quick Response layer — this endpoint is the only
   * place a reopen decision is actually persisted (Quick Response is one
   * caller of it, not the only one), so the audit trail can't be bypassed
   * by calling this endpoint directly.
   */
  async decide(
    id: string,
    decidedByUserId: string,
    dto: DecideReopenRequestInput,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Reopen request not found.');
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
      await this.notificationClient.notify(
        existing.requestedByUserId,
        'REOPEN_UPDATE',
        'Reopen request decided',
        dto.decision === 'APPROVED'
          ? 'Your reopen request was approved.'
          : 'Your reopen request was rejected.',
        authorizationHeader,
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
