import { badRequest, notFound, HttpError } from '@armman/service-commons';
import type { QuickResponseRepository } from './quick-response.repository';
import type { LookupClient } from './lookup.client';
import type { EscalationClient, EscalationCard } from './escalation.client';
import type { ReopenRequestClient } from './reopen-request.client';
import type { NotificationClient } from './notification.client';
import type { AuditClient } from './audit.client';
import type { ListQuickResponseInput } from './dto/list-quick-response.dto';
import type { DecideQuickResponseInput } from './dto/decide-quick-response.dto';

/** Every ApprovalRequestType maps 1:1 to a Quick Response card type — same name. */
const APPROVAL_REQUEST_CARD_TYPES = new Set([
  'LMP_CHANGE',
  'REFERRAL_INCOMPLETE',
  'ACCOMPANIED_REFERRAL',
  'CLOSURE_REVIEW',
  'REOPEN',
  'DATA_RESTORE',
]);

interface ApprovalRequestCard {
  cardId: string;
  cardType: string;
  cardSource: 'approval_requests';
  beneficiaryId: string | null;
  raisedAt: string;
}

type QuickResponseCard = ApprovalRequestCard | EscalationCard;

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw badRequest('cursor: Invalid cursor.');
  }
  const [createdAtIso, id] = decoded.split('|');
  const createdAt = createdAtIso ? new Date(createdAtIso) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) {
    throw badRequest('cursor: Invalid cursor.');
  }
  return { createdAt, id };
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, 'utf8').toString('base64url');
}

/**
 * Maps an APPROVAL_STATUS value code onto escalation_events.status, or
 * returns null when there's no meaningful equivalent. Only PENDING
 * (escalation_events' "not yet acted on" state is OPEN) has one —
 * APPROVED/REJECTED/AUTO_LAPSED/CANCELLED are approval-specific decision
 * outcomes that don't exist in EscalationStatus's vocabulary, so those
 * statuses skip the escalation-events call entirely rather than forwarding
 * a value that call would reject.
 */
function mapStatusForEscalations(status: string): string | null {
  return status === 'PENDING' ? 'OPEN' : null;
}

/** Quick Response's domain logic: merges approval_requests + escalation_events
 * into one feed, and dispatches decisions per card type. */
export class QuickResponseService {
  constructor(
    private readonly repository: QuickResponseRepository,
    private readonly lookupClient: LookupClient,
    private readonly escalationClient: EscalationClient,
    private readonly reopenRequestClient: ReopenRequestClient,
    private readonly notificationClient: NotificationClient,
    private readonly auditClient: AuditClient,
  ) {}

  /**
   * Merges both sources in memory (no cross-service DB join, per the
   * forklift rule) and re-paginates over the combined set. Cursor pagination
   * across two independently-paginated remote sources is approximate under
   * concurrent writes between page fetches — an accepted trade-off at this
   * scale, not solved further here.
   */
  async list(query: ListQuickResponseInput, authorizationHeader: string) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const approvalStatusId = await this.lookupClient.resolveApprovalStatusId(
      query.status,
      authorizationHeader,
    );
    const approvalRows = approvalStatusId
      ? await this.repository.findMany(approvalStatusId, query.limit, cursor)
      : [];
    const approvalCards: ApprovalRequestCard[] = approvalRows
      .filter((row) => APPROVAL_REQUEST_CARD_TYPES.has(row.requestType))
      .map((row) => ({
        cardId: row.id,
        cardType: row.requestType,
        cardSource: 'approval_requests' as const,
        beneficiaryId: row.beneficiaryId,
        raisedAt: row.createdAt.toISOString(),
      }));

    const escalationStatus = mapStatusForEscalations(query.status);
    const escalationResult = escalationStatus
      ? await this.escalationClient.list(
          escalationStatus,
          query.cursor,
          query.limit,
          authorizationHeader,
        )
      : { cards: [], nextCursor: null };

    const merged: QuickResponseCard[] = [...approvalCards, ...escalationResult.cards].sort(
      (a, b) => new Date(b.raisedAt).getTime() - new Date(a.raisedAt).getTime(),
    );

    const hasMore = merged.length > query.limit;
    const page = hasMore ? merged.slice(0, query.limit) : merged;
    const nextCursor = hasMore
      ? encodeCursor({
          createdAt: new Date(page[page.length - 1].raisedAt),
          id: page[page.length - 1].cardId,
        })
      : null;

    return { cards: page, nextCursor };
  }

  /**
   * Dispatches a decision by card type. Only EDD_NEARING and REOPEN are
   * fully wired in this phase — every other card type's real side effect
   * (ANC regen, incentive trigger, closure/referral status writes) needs a
   * write endpoint in a service that doesn't have one yet, so they respond
   * 501 rather than silently no-op or guess at undefined behavior.
   */
  async decide(
    cardId: string,
    caller: { id: string },
    dto: DecideQuickResponseInput,
    authorizationHeader: string,
  ) {
    if (dto.cardSource === 'escalation_events') {
      return this.decideEscalationCard(cardId, dto);
    }
    return this.decideApprovalRequestCard(cardId, caller, dto, authorizationHeader);
  }

  private async decideEscalationCard(cardId: string, dto: DecideQuickResponseInput) {
    // Only EDD_NEARING is wired this phase; MISSED_VISIT's TRANSFER/CLOSE
    // actions need write paths in services that don't have them yet.
    if (dto.decision !== 'OKAY') {
      throw new HttpError(501, `Decision "${dto.decision}" is not yet implemented for this card.`);
    }
    // Acknowledge-only: no audit_log, no notify (spec's explicit exemption).
    // The actual PENDING->OPEN->DISMISSED status write happens via a future
    // escalation-decision endpoint in notification-escalation-service —
    // out of scope for this phase's EDD_NEARING vertical slice beyond
    // proving the read+dispatch path; tracked as a follow-up.
    return {
      cardId,
      cardSource: 'escalation_events' as const,
      decision: 'OKAY',
      acknowledged: true,
    };
  }

  private async decideApprovalRequestCard(
    cardId: string,
    caller: { id: string },
    dto: DecideQuickResponseInput,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(cardId);
    if (!existing) throw notFound('Quick Response card not found.');

    if (existing.requestType !== 'REOPEN') {
      throw new HttpError(
        501,
        `Decisions on "${existing.requestType}" cards are not yet implemented.`,
      );
    }
    if (dto.decision !== 'APPROVE' && dto.decision !== 'REJECT') {
      throw badRequest('decision: Must be APPROVE or REJECT for a REOPEN card.');
    }
    if (!existing.reopenRequestId) {
      // Data integrity issue, not a client error — a REOPEN approval_requests
      // row must always carry the reopen_requests id it originated from.
      throw new HttpError(500, 'This REOPEN card has no linked reopen request.');
    }

    const decided = await this.reopenRequestClient.decide(
      existing.reopenRequestId,
      dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      dto.decisionReasonCodeLookupId,
      dto.decisionNotes,
      authorizationHeader,
    );

    await this.auditClient.log(
      caller.id,
      `QUICK_RESPONSE_${dto.decision}`,
      'ReopenRequest',
      decided.id,
      { decision: dto.decision, decisionNotes: dto.decisionNotes ?? null },
      authorizationHeader,
    );

    if (existing.requestedByUserId) {
      await this.notificationClient.notify(
        existing.requestedByUserId,
        'REOPEN_UPDATE',
        'Reopen request decided',
        dto.decision === 'APPROVE'
          ? 'Your reopen request was approved.'
          : 'Your reopen request was rejected.',
        authorizationHeader,
      );
    }

    return {
      cardId,
      cardSource: 'approval_requests' as const,
      decision: dto.decision,
      reopenRequest: decided,
    };
  }
}
