import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unprocessable,
  HttpError,
} from '@armman/service-commons';
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
import type { SakhiClient, SakhiRecord } from './sakhi.client';
import type { GeographyClient } from './geography.client';
import type { VisitClient } from './visit.client';
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
  beneficiaryName: string | null;
  sakhiName: string | null;
}

type QuickResponseCard = ApprovalRequestCard | EscalationCard;

/** The calling principal's own scope, as carried on their JWT/trusted-identity headers. */
export interface CallerScope {
  readonly id: string;
  readonly roles: string[];
  readonly projectId: string | null;
}

/**
 * MANAGER/ADMIN are unrestricted across Quick Response's supervisor-scoping
 * checks — checked as the absence of an elevated role, not the presence of
 * a restrictive one (SUPERVISOR), since a caller can hold multiple role
 * assignments at once. Matches auth-service's own isPrivileged() pattern.
 */
function isPrivileged(caller: CallerScope): boolean {
  return caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
}

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

  /** Best-effort — see resolveSakhiName. */
  private async resolveBeneficiaryName(
    beneficiaryId: string,
    authorizationHeader: string,
  ): Promise<string | null> {
    try {
      const beneficiary = await this.beneficiaryClient.getById(beneficiaryId, authorizationHeader);
      return beneficiary?.pii.fullName ?? null;
    } catch (err) {
      console.error(
        `Failed to resolve beneficiary ${beneficiaryId}'s name for a notification:`,
        err,
      );
      return null;
    }
  }

  /**
   * Page-level batch lookup for list() — one call for every beneficiary on
   * the page, instead of one per row (see resolveBeneficiaryName for the
   * single-id version getCardDetail() uses). Best-effort: a failure here
   * degrades the whole page's beneficiaryName to null rather than failing
   * the list.
   */
  private async resolveBeneficiaryNamesById(
    beneficiaryIds: string[],
    authorizationHeader: string,
  ): Promise<Map<string, string>> {
    if (beneficiaryIds.length === 0) return new Map();
    try {
      return await this.beneficiaryClient.getManyWithRisk(beneficiaryIds, authorizationHeader);
    } catch (err) {
      console.error('Failed to batch-resolve beneficiary names for the Quick Response list:', err);
      return new Map();
    }
  }

  /**
   * Page-level Sakhi name lookup for list() — one batch call for every
   * unique Sakhi on the page via auth-service's GET /sakhis/by-ids, instead
   * of one call per Sakhi (see sakhi.client.ts's getManyByIds). Best-effort:
   * a failure here degrades the whole page's sakhiName to null rather than
   * failing the list, matching resolveBeneficiaryNamesById's contract.
   */
  private async resolveSakhiNamesById(
    sakhiIds: string[],
    authorizationHeader: string,
  ): Promise<Map<string, string>> {
    if (sakhiIds.length === 0) return new Map();
    try {
      return await this.sakhiClient.getManyByIds(sakhiIds, authorizationHeader);
    } catch (err) {
      console.error('Failed to batch-resolve Sakhi names for the Quick Response list:', err);
      return new Map();
    }
  }

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
    private readonly sakhiClient: SakhiClient,
    private readonly geographyClient: GeographyClient,
    private readonly visitClient: VisitClient,
  ) {}

  /**
   * Merges both sources in memory (no cross-service DB join, per the
   * forklift rule) and re-paginates over the combined set. Cursor pagination
   * across two independently-paginated remote sources is approximate under
   * concurrent writes between page fetches — an accepted trade-off at this
   * scale, not solved further here.
   */
  /**
   * Resolves the caller's own scope for the approval_requests half of the
   * Quick Response feed — `null` (unrestricted) for MANAGER/ADMIN, or the
   * caller's own assigned Sakhi ids (via auth-service, possibly empty) for
   * a SUPERVISOR. A SUPERVISOR with no projectId on their scope fails
   * closed to zero accessible Sakhis rather than making an unscoped call.
   */
  private async resolveOwnSakhiIds(
    caller: CallerScope,
    authorizationHeader: string,
  ): Promise<string[] | null> {
    if (isPrivileged(caller)) return null;
    if (!caller.projectId) return [];
    return this.sakhiClient.getOwnSakhiIds(caller.projectId, authorizationHeader);
  }

  async list(query: ListQuickResponseInput, caller: CallerScope, authorizationHeader: string) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const [approvalStatusId, sakhiIds] = await Promise.all([
      this.lookupClient.resolveApprovalStatusId(query.status, authorizationHeader),
      this.resolveOwnSakhiIds(caller, authorizationHeader),
    ]);
    const approvalRows = approvalStatusId
      ? await this.repository.findMany(approvalStatusId, query.limit, cursor, sakhiIds)
      : [];
    const typedRows = approvalRows.filter((row) =>
      APPROVAL_REQUEST_CARD_TYPES.has(row.requestType),
    );

    // Only a PENDING page can be stale in the way reconciliation fixes (see
    // filterStillPending's doc comment) — APPROVED/REJECTED queries return
    // typedRows as-is. Run alongside the escalation-events fetch below since
    // neither depends on the other's result — sequential awaits here were
    // pushing PENDING responses past the mobile client's timeout.
    const escalationStatus = mapStatusForEscalations(query.status);
    const [reconciledRows, escalationResult] = await Promise.all([
      query.status === 'PENDING'
        ? this.filterStillPending(typedRows, authorizationHeader)
        : Promise.resolve(typedRows),
      escalationStatus
        ? this.escalationClient.list(
            escalationStatus,
            query.cursor,
            query.limit,
            authorizationHeader,
          )
        : Promise.resolve({ cards: [], nextCursor: null }),
    ]);

    let beneficiaryNames = new Map<string, string>();
    let sakhiNames = new Map<string, string>();
    if (reconciledRows.length > 0) {
      const beneficiaryIds = Array.from(
        new Set(
          reconciledRows.map((row) => row.beneficiaryId).filter((id): id is string => id != null),
        ),
      );
      const sakhiIds = Array.from(new Set(reconciledRows.map((row) => row.requestedByUserId)));
      [beneficiaryNames, sakhiNames] = await Promise.all([
        this.resolveBeneficiaryNamesById(beneficiaryIds, authorizationHeader),
        this.resolveSakhiNamesById(sakhiIds, authorizationHeader),
      ]);
    }

    const approvalCards: ApprovalRequestCard[] = reconciledRows.map((row) => ({
      cardId: row.id,
      cardType: row.requestType,
      cardSource: 'approval_requests' as const,
      beneficiaryId: row.beneficiaryId,
      raisedAt: row.createdAt.toISOString(),
      beneficiaryName: row.beneficiaryId ? (beneficiaryNames.get(row.beneficiaryId) ?? null) : null,
      sakhiName: sakhiNames.get(row.requestedByUserId) ?? null,
    }));

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
   * Per-card-type detail for the Supervisor app's card screen — the list
   * envelope only carries {cardId, cardType, cardSource, beneficiaryId,
   * raisedAt}, not enough to render any of the 8 cards' own content. Tries
   * approval_requests first, then escalation_events, since a bare cardId
   * carries no cardSource of its own (unlike decide(), which the caller
   * already knows the source for).
   *
   * Field sourcing is intentionally partial: LMP Change's sonography image
   * and Accompanied Referral's photo evidence are not returned at all (no
   * upload path exists for either yet — returning a field that would always
   * be null misrepresents it as "checked, found nothing" rather than "not
   * built"). Closure Review's "completion tracker" is likewise omitted —
   * no backing data source was identified for it.
   */
  async getCardDetail(cardId: string, caller: CallerScope, authorizationHeader: string) {
    const approvalRow = await this.repository.findById(cardId);
    if (approvalRow) {
      const sakhiIds = await this.resolveOwnSakhiIds(caller, authorizationHeader);
      if (sakhiIds && !sakhiIds.includes(approvalRow.requestedByUserId)) {
        throw forbidden('You do not have access to this Quick Response card.');
      }
      return this.enrichApprovalRequestCard(approvalRow, authorizationHeader);
    }

    const escalationCard = await this.escalationClient.findById(cardId, authorizationHeader);
    if (escalationCard) {
      return this.enrichEscalationCard(escalationCard, authorizationHeader);
    }

    throw notFound('Quick Response card not found.');
  }

  /**
   * Wraps one supplementary enrichment lookup: logs and returns null on
   * failure rather than throwing, so one unreachable downstream service
   * degrades only its own field instead of failing the whole card detail.
   * Never used for the beneficiary lookup itself — that one is core (names/
   * pada/sakhi/risk all hinge on it) and is allowed to fail the request.
   */
  private async safeResolve<T>(label: string, fn: () => Promise<T | null>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      console.error(
        `Quick Response card detail: failed to resolve ${label} — showing it as unavailable:`,
        err,
      );
      return null;
    }
  }

  /**
   * Beneficiary name/Pada name/Sakhi name+contact/risk details — shared
   * across every card type keyed on a beneficiaryId. The beneficiary
   * lookup itself is core (thrown as-is on failure); Pada/Sakhi resolution
   * is supplementary (fails open to null via safeResolve).
   */
  private async resolveCommonFields(beneficiaryId: string, authorizationHeader: string) {
    const beneficiary = await this.beneficiaryClient.getById(beneficiaryId, authorizationHeader);
    if (!beneficiary) throw notFound('The beneficiary linked to this card was not found.');

    const [pada, sakhi] = await Promise.all([
      beneficiary.pii.padaId
        ? this.safeResolve('Pada', () =>
            this.geographyClient.getById(beneficiary.pii.padaId as string, authorizationHeader),
          )
        : Promise.resolve(null),
      this.safeResolve<SakhiRecord>('Sakhi', () =>
        this.sakhiClient.getById(beneficiary.sakhiId, authorizationHeader),
      ),
    ]);

    return {
      beneficiary,
      beneficiaryName: beneficiary.pii.fullName,
      padaName: pada?.name ?? null,
      sakhiName: sakhi?.displayName ?? null,
      sakhiContactNumber: sakhi?.mobileNumber ?? null,
      riskDetails: beneficiary.riskConditionSummaries,
    };
  }

  private thinCard(row: {
    id: string;
    requestType: string;
    beneficiaryId: string | null;
    createdAt: Date;
  }) {
    return {
      cardId: row.id,
      cardType: row.requestType,
      cardSource: 'approval_requests' as const,
      beneficiaryId: row.beneficiaryId,
      raisedAt: row.createdAt.toISOString(),
    };
  }

  private async enrichApprovalRequestCard(
    row: NonNullable<Awaited<ReturnType<QuickResponseRepository['findById']>>>,
    authorizationHeader: string,
  ) {
    if (!APPROVAL_REQUEST_CARD_TYPES.has(row.requestType)) {
      return this.thinCard(row);
    }

    if (row.requestType === 'DATA_RESTORE') {
      const sakhi = await this.safeResolve<SakhiRecord>('Sakhi', () =>
        this.sakhiClient.getById(row.requestedByUserId, authorizationHeader),
      );
      return {
        ...this.thinCard(row),
        sakhiName: sakhi?.displayName ?? null,
        sakhiId: row.requestedByUserId,
      };
    }

    if (!row.beneficiaryId) {
      // Data-integrity edge case — every other card type is expected to
      // carry a beneficiaryId; without one there's nothing further to
      // resolve, so fall back to the thin shape rather than throwing.
      return this.thinCard(row);
    }
    const beneficiaryId = row.beneficiaryId;

    if (row.requestType === 'LMP_CHANGE') {
      const common = await this.resolveCommonFields(beneficiaryId, authorizationHeader);
      const payload = row.requestPayloadJson as {
        newLmpDate?: string;
        sonographyImageAssetId?: string;
      } | null;
      return {
        ...this.thinCard(row),
        padaName: common.padaName,
        sakhiName: common.sakhiName,
        beneficiaryName: common.beneficiaryName,
        oldLmpDate: common.beneficiary.motherCaseDetails?.lmpDate ?? null,
        newLmpDate: payload?.newLmpDate ?? null,
        sonographyImageAssetId: payload?.sonographyImageAssetId ?? null,
        riskDetails: common.riskDetails,
        sakhiContactNumber: common.sakhiContactNumber,
      };
    }

    if (row.requestType === 'CLOSURE_REVIEW') {
      // resolveCommonFields and the closure fetch have no dependency on each
      // other — run them concurrently instead of stacking their latency.
      const [common, closure] = await Promise.all([
        this.resolveCommonFields(beneficiaryId, authorizationHeader),
        row.closureId
          ? this.safeResolve('closure', () =>
              this.closureClient.getById(row.closureId as string, authorizationHeader),
            )
          : Promise.resolve(null),
      ]);
      return {
        ...this.thinCard(row),
        padaName: common.padaName,
        sakhiName: common.sakhiName,
        beneficiaryName: common.beneficiaryName,
        closureType: closure?.closureType ?? null,
        closureReasonLookupValueId: closure?.closureReasonLookupValueId ?? null,
        closureDate: closure?.closureDate ?? null,
        supervisorNotes: closure?.supervisorNotes ?? null,
        riskDetails: common.riskDetails,
        sakhiContactNumber: common.sakhiContactNumber,
      };
    }

    if (row.requestType === 'REOPEN') {
      // Same independence as CLOSURE_REVIEW above — run concurrently.
      const [common, reopenRequest] = await Promise.all([
        this.resolveCommonFields(beneficiaryId, authorizationHeader),
        row.reopenRequestId
          ? this.safeResolve('reopen request', () =>
              this.reopenRequestClient.getById(row.reopenRequestId as string, authorizationHeader),
            )
          : Promise.resolve(null),
      ]);
      return {
        ...this.thinCard(row),
        padaName: common.padaName,
        sakhiName: common.sakhiName,
        beneficiaryName: common.beneficiaryName,
        reasonForReopen: reopenRequest?.requestReason ?? null,
        riskDetails: common.riskDetails,
        sakhiContactNumber: common.sakhiContactNumber,
      };
    }

    // ACCOMPANIED_REFERRAL / REFERRAL_INCOMPLETE — both key off referralId
    // on the same underlying referrals table (see referral-type guard in
    // risk-referral-service's ReferralService.decide). The referral fetch has
    // no dependency on resolveCommonFields, so the two run concurrently; only
    // REFERRAL_INCOMPLETE's visit fetch below has a real dependency (it needs
    // referral.visitId) and stays sequential after referral resolves.
    const [common, referral] = await Promise.all([
      this.resolveCommonFields(beneficiaryId, authorizationHeader),
      row.referralId
        ? this.safeResolve('referral', () =>
            this.referralClient.getById(row.referralId as string, authorizationHeader),
          )
        : Promise.resolve(null),
    ]);

    if (row.requestType === 'ACCOMPANIED_REFERRAL') {
      return {
        ...this.thinCard(row),
        padaName: common.padaName,
        sakhiName: common.sakhiName,
        beneficiaryName: common.beneficiaryName,
        referralDate: referral?.referralDate ?? null,
        facilityType: referral?.facilityType ?? null,
        facilityName: referral?.facilityName ?? null,
        photoEvidenceAssetId: referral?.photoEvidenceMediaAssetId ?? null,
        riskDetails: common.riskDetails,
        sakhiContactNumber: common.sakhiContactNumber,
      };
    }

    // REFERRAL_INCOMPLETE
    const visit =
      referral?.visitId != null
        ? await this.safeResolve('visit', () =>
            this.visitClient.getById(referral.visitId as string, authorizationHeader),
          )
        : null;
    return {
      ...this.thinCard(row),
      padaName: common.padaName,
      sakhiName: common.sakhiName,
      beneficiaryName: common.beneficiaryName,
      visitReference: visit,
      referralsMissedCount: referral?.incompleteCount ?? null,
      reason: referral?.latestFollowup?.notVisitedReason ?? null,
      riskDetails: common.riskDetails,
      sakhiContactNumber: common.sakhiContactNumber,
    };
  }

  private async enrichEscalationCard(card: EscalationCard, authorizationHeader: string) {
    const common = await this.resolveCommonFields(card.beneficiaryId, authorizationHeader);

    if (card.cardType === 'EDD_NEARING') {
      const eddDate = common.beneficiary.motherCaseDetails?.eddDate ?? null;
      return {
        ...card,
        padaName: common.padaName,
        sakhiName: common.sakhiName,
        beneficiaryName: common.beneficiaryName,
        eddDate,
        reason: eddDate ? `EDD approaching on ${eddDate.slice(0, 10)}` : null,
        riskDetails: common.riskDetails,
        sakhiContactNumber: common.sakhiContactNumber,
      };
    }

    // MISSED_VISIT — "# visits missed" is omitted: no confirmed data source
    // (the same gap flagged for call-sheet-stats' own MISSED_VISIT row).
    return {
      ...card,
      padaName: common.padaName,
      sakhiName: common.sakhiName,
      beneficiaryName: common.beneficiaryName,
      visitType: card.escalationType,
      riskDetails: common.riskDetails,
      sakhiContactNumber: common.sakhiContactNumber,
    };
  }

  /**
   * Re-checks each CLOSURE_REVIEW/REOPEN/REFERRAL_INCOMPLETE/
   * ACCOMPANIED_REFERRAL row against its own backing resource before
   * returning a PENDING page. `approval_requests.decisionStatusLookupId` is
   * only updated by this service's own decide() — but closures,
   * reopen_requests, and referrals each also have their own decision
   * endpoints (PATCH and, for the Supervisor app, POST) that write straight
   * to their own tables without ever notifying approval-service. Without
   * this check, a card decided that way would sit in this list forever
   * looking pending, and a later attempt to decide it via Quick Response
   * would 409 with a confusing "already decided" from the *other* service.
   *
   * LMP_CHANGE and DATA_RESTORE have no backing resource of their own, so
   * they're left out of every id group below and pass through unreconciled
   * — approval_requests is already the sole source of truth for them.
   *
   * A downstream service that's unreachable fails OPEN for its own group
   * (logged, that group's cards pass through un-reconciled) rather than
   * failing the whole list — a stale card reappearing briefly is a smaller
   * problem than the entire Quick Response queue erroring out.
   */
  private async filterStillPending<
    T extends {
      id: string;
      requestType: string;
      closureId: string | null;
      reopenRequestId: string | null;
      referralId: string | null;
    },
  >(rows: T[], authorizationHeader: string): Promise<T[]> {
    const closureIds = rows
      .filter((row) => row.requestType === 'CLOSURE_REVIEW' && row.closureId)
      .map((row) => row.closureId as string);
    const reopenRequestIds = rows
      .filter((row) => row.requestType === 'REOPEN' && row.reopenRequestId)
      .map((row) => row.reopenRequestId as string);
    const referralIds = rows
      .filter(
        (row) =>
          (row.requestType === 'REFERRAL_INCOMPLETE' ||
            row.requestType === 'ACCOMPANIED_REFERRAL') &&
          row.referralId,
      )
      .map((row) => row.referralId as string);

    const [closureResult, reopenResult, referralResult] = await Promise.all([
      this.safeGetDecisionStatus('closure', closureIds, (ids) =>
        this.closureClient.getDecisionStatusByIds(ids, authorizationHeader),
      ),
      this.safeGetDecisionStatus('reopen request', reopenRequestIds, (ids) =>
        this.reopenRequestClient.getDecisionStatusByIds(ids, authorizationHeader),
      ),
      this.safeGetDecisionStatus('referral', referralIds, (ids) =>
        this.referralClient.getDecisionStatusByIds(ids, authorizationHeader),
      ),
    ]);

    return rows.filter((row) => {
      if (row.requestType === 'CLOSURE_REVIEW' && row.closureId) {
        if (!closureResult.ok) return true;
        return closureResult.statuses.get(row.closureId) === 'PENDING';
      }
      if (row.requestType === 'REOPEN' && row.reopenRequestId) {
        if (!reopenResult.ok) return true;
        return reopenResult.statuses.get(row.reopenRequestId) === 'PENDING';
      }
      if (
        (row.requestType === 'REFERRAL_INCOMPLETE' || row.requestType === 'ACCOMPANIED_REFERRAL') &&
        row.referralId
      ) {
        if (!referralResult.ok) return true;
        return referralResult.statuses.get(row.referralId) === 'PENDING_FOLLOWUP';
      }
      return true;
    });
  }

  /**
   * Wraps one reconciliation batch call: skipped entirely (no network call)
   * for an empty id group, and on failure logs and reports `ok: false`
   * rather than throwing — so filterStillPending can fail open for just
   * that group instead of failing the whole Quick Response list.
   */
  private async safeGetDecisionStatus(
    label: string,
    ids: string[],
    fetcher: (ids: string[]) => Promise<Map<string, string | null>>,
  ): Promise<{ ok: boolean; statuses: Map<string, string | null> }> {
    if (ids.length === 0) return { ok: true, statuses: new Map() };
    try {
      return { ok: true, statuses: await fetcher(ids) };
    } catch (err) {
      console.error(
        `Quick Response list(): failed to reconcile ${label} decision status for ${ids.length} ` +
          'card(s) — showing them as still pending:',
        err,
      );
      return { ok: false, statuses: new Map() };
    }
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

  /**
   * Detail view for the Supervisor app's dedicated GET
   * /lmp-change-requests/:id resource. LMP_CHANGE has no table of its own
   * (see enrichApprovalRequestCard's LMP_CHANGE branch, which this mirrors)
   * — this is a read-shaped projection over the same approval_requests row
   * decideLmpChangeRequest above guards, with the same 404 type-check so
   * this URL can never leak a different card type's data.
   */
  async getLmpChangeRequestDetail(id: string, authorizationHeader: string) {
    const existing = await this.repository.findById(id);
    if (!existing || existing.requestType !== 'LMP_CHANGE') {
      throw notFound('LMP change request not found.');
    }
    if (!existing.beneficiaryId) {
      throw new HttpError(500, 'This LMP_CHANGE card has no linked beneficiary.');
    }

    const [common, supervisorStatus] = await Promise.all([
      this.resolveCommonFields(existing.beneficiaryId, authorizationHeader),
      this.lookupClient.resolveApprovalStatusCode(
        existing.decisionStatusLookupId,
        authorizationHeader,
      ),
    ]);
    const payload = existing.requestPayloadJson as {
      newLmpDate?: string;
      sonographyImageAssetId?: string;
    } | null;

    return {
      id: existing.id,
      beneficiaryId: existing.beneficiaryId,
      oldLmpDate: common.beneficiary.motherCaseDetails?.lmpDate ?? null,
      newLmpDate: payload?.newLmpDate ?? null,
      sonographyImageAssetId: payload?.sonographyImageAssetId ?? null,
      requestedByUserId: existing.requestedByUserId,
      requestedAt: existing.createdAt.toISOString(),
      supervisorStatus,
    };
  }

  /**
   * EDD_NEARING supports only OKAY (acknowledge-only: no audit_log, no
   * notify — spec's explicit exemption). MISSED_VISIT supports TRANSFER/
   * CLOSE, not APPROVE/REJECT; both are fully implemented downstream (see
   * EscalationService.decideMissedVisit). Both branches delegate the
   * actual write to notification-escalation-service via EscalationClient —
   * this dispatch never persists anything itself, so a second decide on an
   * already-decided card surfaces that service's own 409 rather than
   * faking a second success.
   */
  private async decideEscalationCard(
    cardId: string,
    dto: DecideQuickResponseInput,
    authorizationHeader: string,
  ) {
    const existing = await this.escalationClient.findById(cardId, authorizationHeader);
    if (!existing) throw notFound('Quick Response card not found.');

    if (existing.cardType === 'EDD_NEARING') {
      if (dto.decision !== 'OKAY') {
        throw new HttpError(
          501,
          `Decision "${dto.decision}" is not yet implemented for this card.`,
        );
      }
      const acknowledged = await this.escalationClient.acknowledgeEddNearing(
        cardId,
        authorizationHeader,
      );
      return {
        cardId,
        cardSource: 'escalation_events' as const,
        decision: 'OKAY',
        acknowledged: true,
        status: acknowledged.status,
      };
    }

    // MISSED_VISIT
    if (dto.decision !== 'TRANSFER' && dto.decision !== 'CLOSE') {
      throw new HttpError(501, `Decision "${dto.decision}" is not yet implemented for this card.`);
    }
    const decided = await this.escalationClient.decideMissedVisit(
      cardId,
      dto.decision,
      authorizationHeader,
    );
    return {
      cardId,
      cardSource: 'escalation_events' as const,
      decision: dto.decision,
      status: decided.status,
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

    // Cheap pre-check, shared by every card type: a card already decided by
    // the time we even read it here is rejected before any side effect is
    // attempted. This alone is NOT a race guard — two concurrent decides can
    // both pass this read before either has written anything.
    //
    // CLOSURE_REVIEW/REFERRAL_INCOMPLETE/ACCOMPANIED_REFERRAL/REOPEN are
    // still safe under that race because each forwards to a downstream
    // service (closure-reopen-service / risk-referral-service) with its own
    // atomic PENDING-only status guard — a second concurrent decide on those
    // types 409s downstream even if it slips past the check below.
    //
    // LMP_CHANGE and DATA_RESTORE have no such downstream backstop: their
    // side effects (LMP/EDD write to beneficiary-service, user reactivation
    // via auth-service) are unconditional writes with no "only if still
    // pending" guard of their own. So for those two types this method claims
    // the row atomically via repository.markDecided() BEFORE running the
    // side effect, instead of after — the loser of the race gets a 409 here
    // and never reaches the side effect at all. The other types keep
    // claiming the row only after their side effect succeeds, via the
    // try/catch at the end of this method.
    if (existing.decidedAt) {
      throw conflict('This Quick Response card has already been decided.');
    }

    let result: Record<string, unknown>;
    let alreadyMarkedDecided = false;
    if (existing.requestType === 'LMP_CHANGE' || existing.requestType === 'DATA_RESTORE') {
      // Validated again, redundantly, inside decideLmpChangeCard/
      // decideDataRestoreCard below — but it must also happen here, before
      // the pre-claim, so an invalid decision value never claims the row.
      // Claiming first and validating after would mark a card decided for a
      // request that was never going to apply any real decision.
      if (dto.decision !== 'APPROVE' && dto.decision !== 'REJECT') {
        throw badRequest(
          `decision: Must be APPROVE or REJECT for a${
            existing.requestType === 'LMP_CHANGE' ? 'n LMP_CHANGE' : ' DATA_RESTORE'
          } card.`,
        );
      }

      // Every approval_requests decision reaching this point is APPROVE or
      // REJECT — the OKAY decision only exists on the escalation_events
      // branch, which returns earlier in decide() and never reaches here.
      const decisionStatusLookupId = await this.lookupClient.resolveApprovalStatusId(
        dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        authorizationHeader,
      );
      if (!decisionStatusLookupId) {
        // Unlike the post-side-effect lookup below, there is no side effect
        // yet to protect — failing loudly here is safe and correct, so this
        // does not get the "log and continue, remains re-decidable"
        // tolerance used once the side effect has already happened.
        throw new HttpError(
          500,
          `No ${dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'} APPROVAL_STATUS lookup ` +
            'value was found; cannot safely claim this card before applying its decision.',
        );
      }
      const claimed = await this.repository.markDecided(
        cardId,
        decisionStatusLookupId,
        decidedByUserId,
        dto.decisionNotes,
        dto.decisionReasonCodeLookupId,
      );
      if (!claimed) {
        throw conflict('This Quick Response card has already been decided.');
      }
      alreadyMarkedDecided = true;
    }

    if (existing.requestType === 'LMP_CHANGE') {
      result = await this.decideLmpChangeCard(cardId, existing, dto, authorizationHeader);
    } else if (existing.requestType === 'DATA_RESTORE') {
      result = await this.decideDataRestoreCard(cardId, existing, dto, authorizationHeader);
    } else if (existing.requestType === 'CLOSURE_REVIEW') {
      result = await this.decideClosureReviewCard(cardId, existing, dto, authorizationHeader);
    } else if (existing.requestType === 'REFERRAL_INCOMPLETE') {
      result = await this.decideReferralIncompleteCard(cardId, existing, dto, authorizationHeader);
    } else if (existing.requestType === 'ACCOMPANIED_REFERRAL') {
      result = await this.decideAccompaniedReferralCard(cardId, existing, dto, authorizationHeader);
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
    //
    // LMP_CHANGE/DATA_RESTORE already claimed the row atomically above,
    // before their side effect ran, so this after-the-fact marking must be
    // skipped for them — running it again here would be a harmless no-op at
    // best (decidedAt is already set) but is skipped anyway to keep this
    // block's job limited to the types that actually still need it.
    if (!alreadyMarkedDecided) {
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
      const [sakhiName, beneficiaryName] = await Promise.all([
        this.resolveSakhiName(existing.requestedByUserId, authorizationHeader),
        existing.beneficiaryId
          ? this.resolveBeneficiaryName(existing.beneficiaryId, authorizationHeader)
          : Promise.resolve(null),
      ]);
      await this.notificationClient.notify(
        existing.requestedByUserId,
        'LMP_CHANGE_UPDATE',
        sakhiName ? `LMP change request — ${sakhiName}` : 'LMP change request decided',
        beneficiaryName
          ? `${beneficiaryName}'s LMP change was ${dto.decision === 'APPROVE' ? 'approved' : 'rejected'}`
          : dto.decision === 'APPROVE'
            ? 'Your LMP change request was approved.'
            : 'Your LMP change request was rejected.',
        authorizationHeader,
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: cardId },
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
    existing: {
      referralId: string | null;
      beneficiaryId: string | null;
      requestedByUserId: string;
    },
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
      const [sakhiName, beneficiaryName] = await Promise.all([
        this.resolveSakhiName(existing.requestedByUserId, authorizationHeader),
        existing.beneficiaryId
          ? this.resolveBeneficiaryName(existing.beneficiaryId, authorizationHeader)
          : Promise.resolve(null),
      ]);
      await this.notificationClient.notify(
        existing.requestedByUserId,
        'REFERRAL_INCOMPLETE_UPDATE',
        sakhiName ? `Referral follow-up — ${sakhiName}` : 'Referral follow-up decided',
        beneficiaryName
          ? dto.decision === 'APPROVE'
            ? `${beneficiaryName}'s referral follow-up was marked Lapsed`
            : `${beneficiaryName}'s referral follow-up needs to be refilled`
          : dto.decision === 'APPROVE'
            ? 'Your referral follow-up was marked Lapsed by your Supervisor.'
            : 'Please refill the referral follow-up form.',
        authorizationHeader,
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: cardId },
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

    let approvedBeneficiaryName: string | null = null;
    if (dto.decision === 'APPROVE') {
      if (!existing.beneficiaryId) {
        throw new HttpError(500, 'This ACCOMPANIED_REFERRAL card has no linked beneficiary.');
      }
      // The beneficiary lookup only needs the already-known beneficiaryId —
      // it has no dependency on the referral decision's result — so run it
      // concurrently with referralClient.decide() instead of after it.
      const [, beneficiary] = await Promise.all([
        this.referralClient.decide(existing.referralId, 'COMPLETE', authorizationHeader),
        this.beneficiaryClient.getById(existing.beneficiaryId, authorizationHeader),
      ]);
      if (!beneficiary) {
        throw notFound('The beneficiary linked to this referral was not found.');
      }
      approvedBeneficiaryName = beneficiary.pii.fullName;
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
      const [sakhiName, beneficiaryName] = await Promise.all([
        this.resolveSakhiName(existing.requestedByUserId, authorizationHeader),
        approvedBeneficiaryName
          ? Promise.resolve(approvedBeneficiaryName)
          : existing.beneficiaryId
            ? this.resolveBeneficiaryName(existing.beneficiaryId, authorizationHeader)
            : Promise.resolve(null),
      ]);
      await this.notificationClient.notify(
        existing.requestedByUserId,
        'ACCOMPANIED_REFERRAL_UPDATE',
        sakhiName ? `Accompanied referral — ${sakhiName}` : 'Accompanied referral decided',
        beneficiaryName
          ? dto.decision === 'APPROVE'
            ? `${beneficiaryName}'s accompanied referral was approved and completed`
            : `${beneficiaryName}'s accompanied referral was rejected`
          : dto.decision === 'APPROVE'
            ? 'Your accompanied referral was approved and completed.'
            : 'Your accompanied referral was rejected.',
        authorizationHeader,
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: cardId },
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
      const sakhiName = await this.resolveSakhiName(
        existing.requestedByUserId,
        authorizationHeader,
      );
      await this.notificationClient.notify(
        existing.requestedByUserId,
        'DATA_RESTORE_UPDATE',
        sakhiName ? `Data restore request — ${sakhiName}` : 'Data restore request decided',
        dto.decision === 'APPROVE'
          ? 'Your account has been reactivated.'
          : 'Your data restore request was rejected.',
        authorizationHeader,
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: cardId },
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
