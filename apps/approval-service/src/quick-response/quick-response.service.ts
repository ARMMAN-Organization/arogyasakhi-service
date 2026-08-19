import { badRequest, conflict, notFound, unprocessable, HttpError } from '@armman/service-commons';
import type { QuickResponseRepository } from './quick-response.repository';
import type { LookupClient } from './lookup.client';
import type { EscalationClient, EscalationCard } from './escalation.client';
import type { ReopenRequestClient } from './reopen-request.client';
import type { BeneficiaryClient } from './beneficiary.client';
import type { NotificationClient } from './notification.client';
import type { ClosureClient } from './closure.client';
import type { ReferralClient } from './referral.client';
import type { IncentiveClient } from './incentive.client';
import type { UserClient } from './user.client';
import type { ListQuickResponseInput } from './dto/list-quick-response.dto';
import type { DecideQuickResponseInput } from './dto/decide-quick-response.dto';
import type { DecideLmpChangeRequestInput } from '../lmp-change-requests/dto/decide-lmp-change-request.dto';

/**
 * ApprovalRequestTypes surfaced as Quick Response cards — each maps 1:1 to a
 * card type of the same name.
 *
 * DATA_RESTORE is included for visibility even though it has no decision
 * path yet (see decideApprovalRequestCard) — per SRS FR-SV-4.6 its restore
 * flow and backend behaviour must be confirmed with ARMMAN before the module
 * is built. A Supervisor can see the card was raised; attempting to decide
 * it correctly 501s with a message naming the blocker rather than silently
 * hiding a request that exists.
 */
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
    private readonly beneficiaryClient: BeneficiaryClient,
    private readonly notificationClient: NotificationClient,
    private readonly closureClient: ClosureClient,
    private readonly referralClient: ReferralClient,
    private readonly incentiveClient: IncentiveClient,
    private readonly userClient: UserClient,
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
    dto: DecideQuickResponseInput,
    decidedByUserId: string,
    authorizationHeader: string,
  ) {
    if (dto.cardSource === 'escalation_events') {
      return this.decideEscalationCard(cardId, dto, authorizationHeader);
    }
    return this.decideApprovalRequestCard(cardId, dto, decidedByUserId, authorizationHeader);
  }

  /**
   * Decides an LMP_CHANGE card via the Supervisor app's dedicated
   * POST /lmp-change-requests/:id/decision resource. `id` is the underlying
   * approval_requests row's own id — resolved and type-checked here (404 if
   * missing or not actually an LMP_CHANGE row) before delegating to the
   * existing `decide()`/`decideLmpChangeCard` unchanged, so this route can
   * never be used to decide a different card type under a mismatched URL.
   */
  async decideLmpChangeRequest(
    id: string,
    dto: DecideLmpChangeRequestInput,
    decidedByUserId: string,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(id);
    if (!existing || existing.requestType !== 'LMP_CHANGE') {
      throw notFound('LMP change request not found.');
    }
    return this.decide(
      id,
      { cardSource: 'approval_requests', ...dto },
      decidedByUserId,
      authorizationHeader,
    );
  }

  private async decideEscalationCard(
    cardId: string,
    dto: DecideQuickResponseInput,
    authorizationHeader: string,
  ) {
    const existing = await this.escalationClient.findById(cardId, authorizationHeader);
    if (!existing) throw notFound('Quick Response card not found.');

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
    dto: DecideQuickResponseInput,
    decidedByUserId: string,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(cardId);
    if (!existing) throw notFound('Quick Response card not found.');

    // Only LMP_CHANGE has no downstream state of its own to lean on for
    // idempotency (unlike CLOSURE_REVIEW/REFERRAL_INCOMPLETE/ACCOMPANIED_
    // REFERRAL/REOPEN, each guarded by the target service's own
    // PENDING-only status check) — so re-approving an already-decided
    // LMP_CHANGE card silently re-applied the LMP/EDD write and re-notified
    // the Sakhi, contradicting this endpoint's documented "409: Card
    // already decided" contract. Checked here, once, for every card type
    // rather than duplicated per handler.
    if (existing.decidedAt) {
      throw conflict('This Quick Response card has already been decided.');
    }

    let result: Record<string, unknown>;
    if (existing.requestType === 'LMP_CHANGE') {
      result = await this.decideLmpChangeCard(cardId, existing, dto, authorizationHeader);
    } else if (existing.requestType === 'CLOSURE_REVIEW') {
      result = await this.decideClosureReviewCard(cardId, existing, dto, authorizationHeader);
    } else if (existing.requestType === 'REFERRAL_INCOMPLETE') {
      result = await this.decideReferralIncompleteCard(cardId, existing, dto, authorizationHeader);
    } else if (existing.requestType === 'ACCOMPANIED_REFERRAL') {
      result = await this.decideAccompaniedReferralCard(cardId, existing, dto, authorizationHeader);
    } else if (existing.requestType === 'DATA_RESTORE') {
      result = await this.decideDataRestoreCard(cardId, existing, dto, authorizationHeader);
    } else if (existing.requestType === 'REOPEN') {
      if (dto.decision !== 'APPROVE' && dto.decision !== 'REJECT') {
        throw badRequest('decision: Must be APPROVE or REJECT for a REOPEN card.');
      }
      if (!existing.reopenRequestId) {
        // Data integrity issue, not a client error — a REOPEN
        // approval_requests row must always carry the reopen_requests id it
        // originated from.
        throw new HttpError(500, 'This REOPEN card has no linked reopen request.');
      }

      // The audit_log entry and Sakhi notification are written by
      // closure-reopen-service's own decide flow, not here — that's the only
      // place a reopen decision is actually persisted, so the audit trail
      // can't be bypassed by calling that endpoint directly instead of through
      // Quick Response.
      const decided = await this.reopenRequestClient.decide(
        existing.reopenRequestId,
        dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        dto.decisionReasonCodeLookupId,
        dto.decisionNotes,
        authorizationHeader,
      );

      result = {
        cardId,
        cardSource: 'approval_requests' as const,
        decision: dto.decision,
        reopenRequest: decided,
      };
    } else {
      throw new HttpError(
        501,
        `Decisions on "${existing.requestType}" cards are not yet implemented.`,
      );
    }

    // Marked decided only after the real side effect above has already
    // succeeded — a failure to persist this marker must not be reported as
    // if the decision itself failed (log-and-continue, like every other
    // post-commit call in this method), but it also must never run before
    // the side effect, or a card could be marked decided while its actual
    // effect never happened.
    try {
      // Every approval_requests decision reaching this point is APPROVE or
      // REJECT — the OKAY decision only exists on the escalation_events
      // branch, which returns earlier in decide() and never reaches here.
      const decisionStatusLookupId = await this.lookupClient.resolveApprovalStatusId(
        dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        authorizationHeader,
      );
      if (decisionStatusLookupId) {
        await this.repository.markDecided(
          cardId,
          decisionStatusLookupId,
          decidedByUserId,
          dto.decisionNotes,
          dto.decisionReasonCodeLookupId,
        );
      } else {
        console.error(
          `Quick Response card ${cardId} was decided (${dto.decision}) but no ` +
            `${dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'} APPROVAL_STATUS lookup ` +
            'value was found — the card cannot be marked decided and remains re-decidable.',
        );
      }
    } catch (err) {
      console.error(
        `Quick Response card ${cardId} was decided (${dto.decision}) but marking it decided failed:`,
        err,
      );
    }

    return result;
  }

  /**
   * Decides an LMP_CHANGE card (FR-SV-4.2). On APPROVE, applies the new
   * lmpDate via beneficiary-service's PATCH /beneficiaries/:id/lmp — that
   * call's failure is NOT tolerated (unlike the Sakhi notification below):
   * an LMP write failing must surface to the Supervisor as a real error to
   * retry, not be silently swallowed as if the decision succeeded. On
   * REJECT, nothing is applied. Either way the Sakhi is notified, best-effort
   * (a notification failure must not undo an already-applied/rejected
   * decision).
   *
   * Does not regenerate the ANC visit schedule — see
   * BeneficiaryService.applyLmpChange's doc comment for why (schedules are
   * device-generated, not server-side).
   */
  private async decideLmpChangeCard(
    cardId: string,
    existing: {
      beneficiaryId: string | null;
      requestPayloadJson: unknown;
      requestedByUserId: string;
    },
    dto: DecideQuickResponseInput,
    authorizationHeader: string,
  ) {
    if (dto.decision !== 'APPROVE' && dto.decision !== 'REJECT') {
      throw badRequest('decision: Must be APPROVE or REJECT for an LMP_CHANGE card.');
    }

    if (dto.decision === 'APPROVE') {
      if (!existing.beneficiaryId) {
        throw new HttpError(500, 'This LMP_CHANGE card has no linked beneficiary.');
      }
      const payload = existing.requestPayloadJson as { newLmpDate?: unknown } | null;
      if (!payload || typeof payload.newLmpDate !== 'string') {
        throw unprocessable('This LMP_CHANGE card has no valid newLmpDate to apply.');
      }
      await this.beneficiaryClient.applyLmpChange(
        existing.beneficiaryId,
        payload.newLmpDate,
        authorizationHeader,
      );
    }

    try {
      await this.notificationClient.notify(
        existing.requestedByUserId,
        'LMP_CHANGE_UPDATE',
        'LMP change request decided',
        dto.decision === 'APPROVE'
          ? 'Your LMP change request was approved.'
          : 'Your LMP change request was rejected.',
        authorizationHeader,
      );
    } catch (err) {
      console.error(
        `LMP_CHANGE card ${cardId} was decided (${dto.decision}) but the Sakhi notification failed:`,
        err,
      );
    }

    return {
      cardId,
      cardSource: 'approval_requests' as const,
      decision: dto.decision,
    };
  }

  /**
   * Decides a CLOSURE_REVIEW card (FR-SV-4.4). Forwards the decision to
   * closure-reopen-service's PATCH /closures/:id/decision, which is the only
   * place a closure decision is actually persisted — the "beneficiary
   * moves to Closed/Open list" consequence lives there too. That endpoint
   * already sends the Sakhi notification itself, so unlike LMP_CHANGE this
   * method does not notify a second time.
   */
  private async decideClosureReviewCard(
    cardId: string,
    existing: { closureId: string | null },
    dto: DecideQuickResponseInput,
    authorizationHeader: string,
  ) {
    if (dto.decision !== 'APPROVE' && dto.decision !== 'REJECT') {
      throw badRequest('decision: Must be APPROVE or REJECT for a CLOSURE_REVIEW card.');
    }
    if (!existing.closureId) {
      // Data integrity issue, not a client error — a CLOSURE_REVIEW
      // approval_requests row must always carry the closures id it
      // originated from.
      throw new HttpError(500, 'This CLOSURE_REVIEW card has no linked closure.');
    }

    const decided = await this.closureClient.decide(
      existing.closureId,
      dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      dto.decisionNotes,
      authorizationHeader,
    );

    return {
      cardId,
      cardSource: 'approval_requests' as const,
      decision: dto.decision,
      closure: decided,
    };
  }

  /**
   * Decides a REFERRAL_INCOMPLETE card (FR-SV-4.5). Approve marks the
   * referral Lapsed and grants no incentive (per spec). Reject makes no
   * referral-side state change — the Sakhi must refill the follow-up form —
   * but still round-trips through risk-referral-service's decide endpoint so
   * a REFILL on a referral that isn't actually PENDING_FOLLOWUP still 409s,
   * same as the approve path. Either way the Sakhi is notified, best-effort.
   */
  private async decideReferralIncompleteCard(
    cardId: string,
    existing: { referralId: string | null; requestedByUserId: string },
    dto: DecideQuickResponseInput,
    authorizationHeader: string,
  ) {
    if (dto.decision !== 'APPROVE' && dto.decision !== 'REJECT') {
      throw badRequest('decision: Must be APPROVE or REJECT for a REFERRAL_INCOMPLETE card.');
    }
    if (!existing.referralId) {
      // Data integrity issue, not a client error — a REFERRAL_INCOMPLETE
      // approval_requests row must always carry the referrals id it
      // originated from.
      throw new HttpError(500, 'This REFERRAL_INCOMPLETE card has no linked referral.');
    }

    await this.referralClient.decide(
      existing.referralId,
      dto.decision === 'APPROVE' ? 'LAPSE' : 'REFILL',
      authorizationHeader,
    );

    try {
      await this.notificationClient.notify(
        existing.requestedByUserId,
        'REFERRAL_INCOMPLETE_UPDATE',
        'Referral follow-up decided',
        dto.decision === 'APPROVE'
          ? 'Your referral follow-up was marked Lapsed by your Supervisor.'
          : 'Please refill the referral follow-up form.',
        authorizationHeader,
      );
    } catch (err) {
      console.error(
        `REFERRAL_INCOMPLETE card ${cardId} was decided (${dto.decision}) but the Sakhi notification failed:`,
        err,
      );
    }

    return {
      cardId,
      cardSource: 'approval_requests' as const,
      decision: dto.decision,
    };
  }

  /**
   * Decides an ACCOMPANIED_REFERRAL card (FR-SV-4.9). Approve marks the
   * referral Completed, then resolves the assigned Sakhi (via the referral's
   * beneficiary — neither approval_requests nor referrals carries a sakhiId
   * column) and triggers the incentive. The referral decision itself is NOT
   * tolerated — a Supervisor approving this card needs the referral to
   * actually complete, not silently fail while looking successful.
   *
   * The incentive trigger, unlike the referral decision, IS best-effort: by
   * the time it runs, risk-referral-service has already committed the
   * referral to COMPLETED — a one-shot, PENDING_FOLLOWUP-only transition
   * with no way back. If the incentive call were allowed to fail the whole
   * request, there would be no way to retry just this step (any retry
   * immediately 409s on the already-terminal referral), permanently
   * dropping a payout instead of just needing a manual follow-up. Logged,
   * not thrown — same log-and-continue shape as the Sakhi notification
   * below, not a "this must succeed" call like the referral decision above.
   *
   * Reject makes no referral-side call at all (the referral stays Pending,
   * per spec) and grants no incentive. Either way the Sakhi is notified,
   * best-effort.
   */
  private async decideAccompaniedReferralCard(
    cardId: string,
    existing: {
      referralId: string | null;
      beneficiaryId: string | null;
      requestedByUserId: string;
    },
    dto: DecideQuickResponseInput,
    authorizationHeader: string,
  ) {
    if (dto.decision !== 'APPROVE' && dto.decision !== 'REJECT') {
      throw badRequest('decision: Must be APPROVE or REJECT for an ACCOMPANIED_REFERRAL card.');
    }
    if (!existing.referralId) {
      // Data integrity issue, not a client error — an ACCOMPANIED_REFERRAL
      // approval_requests row must always carry the referrals id it
      // originated from.
      throw new HttpError(500, 'This ACCOMPANIED_REFERRAL card has no linked referral.');
    }

    if (dto.decision === 'APPROVE') {
      await this.referralClient.decide(existing.referralId, 'COMPLETE', authorizationHeader);

      if (!existing.beneficiaryId) {
        throw new HttpError(500, 'This ACCOMPANIED_REFERRAL card has no linked beneficiary.');
      }
      const beneficiary = await this.beneficiaryClient.getById(
        existing.beneficiaryId,
        authorizationHeader,
      );
      if (!beneficiary) {
        throw notFound('The beneficiary linked to this referral was not found.');
      }
      try {
        await this.incentiveClient.triggerAccompaniedReferral(
          beneficiary.sakhiId,
          existing.referralId,
          authorizationHeader,
        );
      } catch (err) {
        console.error(
          `ACCOMPANIED_REFERRAL card ${cardId} was approved and the referral marked COMPLETED, ` +
            `but the incentive trigger failed (referral cannot be re-decided to retry — ` +
            `needs manual follow-up):`,
          err,
        );
      }
    }

    try {
      await this.notificationClient.notify(
        existing.requestedByUserId,
        'ACCOMPANIED_REFERRAL_UPDATE',
        'Accompanied referral decided',
        dto.decision === 'APPROVE'
          ? 'Your accompanied referral was approved and completed.'
          : 'Your accompanied referral was rejected.',
        authorizationHeader,
      );
    } catch (err) {
      console.error(
        `ACCOMPANIED_REFERRAL card ${cardId} was decided (${dto.decision}) but the Sakhi notification failed:`,
        err,
      );
    }

    return {
      cardId,
      cardSource: 'approval_requests' as const,
      decision: dto.decision,
    };
  }

  /**
   * Decides a DATA_RESTORE card. Note this does NOT implement the SRS's
   * literal FR-SV-4.6 wording ("data restore is initiated for that Sakhi's
   * device") — that flow remains unconfirmed with ARMMAN and unbuilt. This
   * implements a specifically-approved narrower behavior instead: on
   * APPROVE, reactivates the requesting Sakhi's own user account
   * (requestedByUserId) via auth-service's PATCH /users/:id/reactivate.
   * Not tolerated — same rule as every other reactivation this service
   * performs (LMP change, reopen, referral/closure decisions): a Supervisor
   * who approved this needs to know if the reactivation didn't actually
   * happen, not receive a false "success". REJECT makes no auth-service
   * call and grants no account changes. Either way the Sakhi is notified,
   * best-effort.
   */
  private async decideDataRestoreCard(
    cardId: string,
    existing: { requestedByUserId: string },
    dto: DecideQuickResponseInput,
    authorizationHeader: string,
  ) {
    if (dto.decision !== 'APPROVE' && dto.decision !== 'REJECT') {
      throw badRequest('decision: Must be APPROVE or REJECT for a DATA_RESTORE card.');
    }

    if (dto.decision === 'APPROVE') {
      await this.userClient.reactivateUser(existing.requestedByUserId, authorizationHeader);
    }

    try {
      await this.notificationClient.notify(
        existing.requestedByUserId,
        'DATA_RESTORE_UPDATE',
        'Data restore request decided',
        dto.decision === 'APPROVE'
          ? 'Your account has been reactivated.'
          : 'Your data restore request was rejected.',
        authorizationHeader,
      );
    } catch (err) {
      console.error(
        `DATA_RESTORE card ${cardId} was decided (${dto.decision}) but the Sakhi notification failed:`,
        err,
      );
    }

    return {
      cardId,
      cardSource: 'approval_requests' as const,
      decision: dto.decision,
    };
  }
}
