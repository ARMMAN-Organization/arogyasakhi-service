import { addDays } from '@armman/core';
import {
  badGateway,
  conflict,
  forbidden,
  notFound,
  unprocessable,
  type AuthenticatedUser,
} from '@armman/service-commons';
import type { Referral } from '../../../../node_modules/.prisma/client-risk-referral-service';
import type { ReferralRepository } from './referral.repository';
import type { CreateReferralInput } from './dto/create-referral.dto';
import type { DecideReferralInput } from './dto/decide-referral.dto';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';
import { resolveReferralTypeLookupId } from './lookup.client';
import { IncentiveClient } from './incentive.client';
import { isUniqueConstraintViolation } from './referral.prisma-errors';

/** Referral domain logic. Data access is delegated to the repository. */
export class ReferralService {
  constructor(
    private readonly repository: ReferralRepository,
    private readonly beneficiaryClient: BeneficiaryClient = new BeneficiaryClient(),
    private readonly incentiveClient: IncentiveClient = new IncentiveClient(),
  ) {}

  list() {
    return this.repository.findMany();
  }

  /**
   * Creates a referral, or returns the existing one for this visitId if a
   * second create is attempted for the same visit — the app is offline-
   * first and retries a dropped-connection create, so this must be
   * idempotent rather than erroring on a legitimate retry (Bharath's
   * referral-lifecycle request, 2026-08-27, item #197).
   *
   * `validTill` is always computed as `referralDate + 7 days` (SRS
   * FR-S-6.2's 7-day follow-up window) — never caller-supplied, so the app
   * can't skew it via clock drift/offline queueing (same request, item
   * #195).
   *
   * `visitId` is protected by the `visit_referral_once` unique index
   * (schema.prisma) — at most one referral per visit, referrals with no
   * visitId are unrestricted.
   *
   * The idempotent-retry path only returns the pre-existing row as-is when
   * its business-identifying fields (beneficiaryId, referralTypeLookupValueId,
   * facilityType, facilityName) match this dto — if they differ, this is not
   * a harmless retry of the same request but a genuinely different second
   * referral attempt for the same visit (e.g. a corrected
   * referralTypeLookupValueId after a mistake, or visitId reused for a
   * different beneficiary), so it 409s instead of silently returning the
   * stale/wrong row as a 200 success (PR #199 review).
   */
  async create(dto: CreateReferralInput): Promise<{ referral: Referral; alreadyExisted: boolean }> {
    const validTill = addDays(dto.referralDate, 7);
    try {
      const referral = await this.repository.create({ ...dto, validTill });
      return { referral, alreadyExisted: false };
    } catch (err) {
      if (!isUniqueConstraintViolation(err, 'visit_id')) throw err;
      const existing = dto.visitId ? await this.repository.findByVisitId(dto.visitId) : null;
      if (!existing) {
        throw badGateway(
          'A referral for this visit could not be created, and the existing one could not be found.',
        );
      }
      if (
        existing.beneficiaryId !== dto.beneficiaryId ||
        existing.referralTypeLookupValueId !== dto.referralTypeLookupValueId ||
        existing.facilityType !== (dto.facilityType ?? null) ||
        existing.facilityName !== (dto.facilityName ?? null)
      ) {
        throw conflict(
          'A different referral already exists for this visit — this looks like a new referral attempt, not a retry of the same request.',
        );
      }
      return { referral: existing, alreadyExisted: true };
    }
  }

  /**
   * Real-time status for a batch of referral ids, scoped to the caller via
   * scopeToCaller (SAKHI: own; SUPERVISOR: roster; MANAGER/ADMIN: unscoped)
   * — without this, any SUPERVISOR/MANAGER/ADMIN caller could pass an
   * arbitrary id list and learn the existence/status of referrals outside
   * their own roster (IDOR). An id whose beneficiary is out of scope is
   * simply omitted, same as an unknown/soft-deleted id.
   */
  async getDecisionStatusByIds(
    ids: string[],
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const rows = await this.repository.findManyByIds(ids);
    const scopedBeneficiaryIds = new Set(
      await this.scopeToCaller(
        rows.map((row) => row.beneficiaryId),
        caller,
        authorizationHeader,
      ),
    );
    return rows
      .filter((row) => scopedBeneficiaryIds.has(row.beneficiaryId))
      .map((row) => ({ id: row.id, status: row.status }));
  }

  /**
   * A referral's own fields plus its follow-up summary (incompleteCount,
   * latestFollowup) — added for Quick Response's REFERRAL_INCOMPLETE card
   * enrichment. The summary is always computed (cheap: one count + one
   * findFirst), not gated by referral type, since ACCOMPANIED_REFERRAL
   * callers simply ignore it.
   *
   * Delegates authorization entirely to beneficiaryClient.getById, which
   * enforces beneficiary-service's own SAKHI-own/SUPERVISOR-roster/
   * MANAGER-ADMIN-unrestricted scoping and throws 403/404 for an
   * out-of-roster SUPERVISOR — same IDOR guard the sibling decide()
   * endpoint on this same resource applies. This route is already
   * SUPERVISOR/MANAGER/ADMIN-gated, so that one call is sufficient; unlike
   * decide(), there's no separate roster-list double-check to replicate
   * here.
   */
  async getById(id: string, _caller: AuthenticatedUser, authorizationHeader: string) {
    const referral = await this.repository.findById(id);
    if (!referral) throw notFound('Referral not found.');
    await this.beneficiaryClient.getById(referral.beneficiaryId, authorizationHeader);
    const followupSummary = await this.repository.findFollowupSummary(id);
    return { ...referral, ...followupSummary };
  }

  /**
   * Referral Summary widget — accompaniedReferralsCount/pendingFollowUpsCount
   * for the caller's in-scope beneficiaries, optionally narrowed to one
   * Sakhi via `sakhiId` (the Sakhi dashboard passes their own sakhiId, same
   * as the sibling registration-summary/visit-summary widgets). Scoping
   * itself happens entirely in beneficiary-service's GET /beneficiaries/ids
   * (SAKHI -> own, SUPERVISOR -> roster — optionally narrowed further to
   * one in-roster sakhiId, MANAGER/ADMIN -> unscoped unless sakhiId given,
   * an empty array back for MANAGER/ADMIN with no sakhiId meaning
   * "unscoped" is not distinguishable from "no beneficiaries exist" — see
   * BeneficiaryClient.getIds) — this service only forwards the caller's own
   * token + sakhiId and filters its own tables by whatever id set comes
   * back. MANAGER/ADMIN with no sakhiId get an unfiltered count instead of
   * the (possibly huge) full id list, since beneficiary-service returns
   * "all ids unscoped" for them in that case, not an empty list.
   */
  async getSummary(caller: AuthenticatedUser, authorizationHeader: string, sakhiId?: string) {
    const isUnscoped =
      !sakhiId && (caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN'));
    const beneficiaryIds = isUnscoped
      ? undefined
      : await this.beneficiaryClient.getIds(authorizationHeader, sakhiId);
    const accompaniedLookupValueId = await resolveReferralTypeLookupId(
      'ACCOMPANIED',
      authorizationHeader,
    );
    return this.repository.countSummary(beneficiaryIds, accompaniedLookupValueId);
  }

  /**
   * Intersects a caller-supplied beneficiaryIds list with the caller's own
   * scope, resolved via beneficiary-service's GET /beneficiaries/ids (same
   * helper getSummary uses) — referrals carries no sakhiId column of its
   * own, so this is the only way to scope these endpoints. Never trust
   * `beneficiaryIds` as pre-scoped: without this, any authenticated caller
   * could pass an arbitrary id list and read another Sakhi's follow-ups
   * (IDOR). MANAGER/ADMIN are unscoped (getIds returns "all ids" for them,
   * so the intersection is a no-op).
   */
  private async scopeToCaller(
    beneficiaryIds: string[],
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ): Promise<string[]> {
    const isUnscoped = caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
    if (isUnscoped) return beneficiaryIds;
    const allowedIds = new Set(await this.beneficiaryClient.getIds(authorizationHeader));
    return beneficiaryIds.filter((id) => allowedIds.has(id));
  }

  /**
   * Pending/overdue follow-up counts per beneficiaryId, for the
   * pada-breakdown widget — the caller (api-gateway) sums these per pada
   * using beneficiary-service's own beneficiaryId -> padaId grouping.
   * "Overdue" = a PENDING follow-up whose followupDate has already passed.
   * `beneficiaryIds` is intersected with the caller's own scope via
   * scopeToCaller — an out-of-scope id is silently excluded, not a 403.
   */
  async getPendingFollowupsByBeneficiary(
    beneficiaryIds: string[],
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const scopedIds = await this.scopeToCaller(beneficiaryIds, caller, authorizationHeader);
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    return this.repository.countPendingFollowupsByBeneficiary(scopedIds, today);
  }

  /**
   * Full PENDING follow-up cards (followupId, beneficiaryId, followupDate)
   * for the pada visit-list screen's "referral_follow_up" tab.
   * `beneficiaryIds` is intersected with the caller's own scope via
   * scopeToCaller — an out-of-scope id is silently excluded, not a 403.
   * Unfiltered by date, per findFollowupsByBeneficiary's doc comment.
   */
  async getFollowupsByBeneficiary(
    beneficiaryIds: string[],
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const scopedIds = await this.scopeToCaller(beneficiaryIds, caller, authorizationHeader);
    const rows = await this.repository.findFollowupsByBeneficiary(scopedIds);
    return rows.map((row) => ({
      followupId: row.id,
      beneficiaryId: row.referral.beneficiaryId,
      followupDate: row.followupDate.toISOString().slice(0, 10),
    }));
  }

  /**
   * Decides a referral per two Quick Response card outcomes:
   * - LAPSE (FR-SV-4.5 approve): PENDING_FOLLOWUP -> LAPSED.
   * - REFILL (FR-SV-4.5 reject): no status change — the referral stays
   *   PENDING_FOLLOWUP so the Sakhi can refill the follow-up form. Still
   *   validates the referral exists and is actually PENDING_FOLLOWUP, so a
   *   caller can't "refill" a referral that was never in that state.
   * - COMPLETE (FR-SV-4.9 approve): PENDING_FOLLOWUP -> COMPLETED.
   *
   * Both real status transitions use the same PENDING_FOLLOWUP-only
   * conditional update — a referral not in that state 409s rather than
   * silently no-op'ing.
   *
   * A SUPERVISOR caller may only decide a referral belonging to a
   * beneficiary assigned to their own Sakhi roster — referrals carries no
   * sakhiId column, so this resolves it via beneficiary-service first. Same
   * IDOR guard beneficiary-service's own applyLmpChange/reactivateCase and
   * auth-service's reactivateUser apply to their single-record mutations;
   * without it, any authenticated Supervisor/Manager/Admin could decide any
   * referral system-wide. MANAGER/ADMIN are unscoped.
   */
  async decide(
    id: string,
    dto: DecideReferralInput,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Referral not found.');

    if (caller.roles.includes('SUPERVISOR')) {
      if (!caller.projectId) {
        throw forbidden('Supervisor caller has no project scope.');
      }
      const beneficiary = await this.beneficiaryClient.getById(
        existing.beneficiaryId,
        authorizationHeader,
      );
      if (!beneficiary) {
        throw notFound('The beneficiary linked to this referral was not found.');
      }
      const roster = await listSakhiIdsForSupervisor(
        caller.projectId,
        caller.id,
        authorizationHeader,
      );
      if (!roster.includes(beneficiary.sakhiId)) {
        throw forbidden("This referral is outside this Supervisor's roster.");
      }
    }

    if (existing.status !== 'PENDING_FOLLOWUP') {
      throw conflict(`Cannot decide a referral with status ${existing.status}.`);
    }

    if (dto.decision === 'REFILL') {
      return existing;
    }

    await this.assertDecisionMatchesReferralType(existing, dto.decision, authorizationHeader);

    const toStatus = dto.decision === 'LAPSE' ? 'LAPSED' : 'COMPLETED';
    const updated = await this.repository.updateStatus(id, 'PENDING_FOLLOWUP', toStatus);
    if (!updated) {
      // Raced with another decision between the read above and the
      // conditional update — same outcome as the check above, just caught a
      // beat later instead of trusting a stale read.
      throw conflict(`Cannot decide a referral with status ${existing.status}.`);
    }

    const decided = await this.repository.findById(id);
    if (!decided) throw notFound('Referral not found.');
    return decided;
  }

  /**
   * Guards LAPSE/COMPLETE against being applied to the wrong referral type —
   * COMPLETE (Accompanied Referral's outcome, FR-SV-4.9) must only ever
   * apply to a referral whose referralTypeLookupValueId resolves to
   * ACCOMPANIED, and LAPSE (Referral Follow-up Incomplete's outcome,
   * FR-SV-4.5) must never apply to one. Both PATCH and POST
   * /referrals/:id/decision only ever check `existing.status ===
   * 'PENDING_FOLLOWUP'` — without this, a caller could hit either route
   * directly (bypassing Quick Response's own correct requestType-based
   * dispatch) and COMPLETE a Follow-up-Incomplete referral, wrongly
   * triggering its incentive, or LAPSE an Accompanied one.
   *
   * Fails closed: an unresolvable ACCOMPANIED lookup value (auth-service
   * unreachable, or the code un-seeded) throws rather than guessing at the
   * referral's type — unlike enrichment reads, this guards an incentive-
   * triggering action, so silently letting it through is the wrong default.
   */
  private async assertDecisionMatchesReferralType(
    referral: { referralTypeLookupValueId: string },
    decision: 'LAPSE' | 'COMPLETE',
    authorizationHeader: string,
  ) {
    const accompaniedLookupValueId = await resolveReferralTypeLookupId(
      'ACCOMPANIED',
      authorizationHeader,
    );
    if (!accompaniedLookupValueId) {
      throw badGateway(
        'Unable to resolve the ACCOMPANIED referral type — cannot verify this decision applies to the right referral type.',
      );
    }

    const isAccompanied = referral.referralTypeLookupValueId === accompaniedLookupValueId;
    if (decision === 'COMPLETE' && !isAccompanied) {
      throw unprocessable('COMPLETE can only be applied to an Accompanied Referral.');
    }
    if (decision === 'LAPSE' && isAccompanied) {
      throw unprocessable('LAPSE cannot be applied to an Accompanied Referral.');
    }
  }

  /**
   * Decides an Accompanied Referral via the Supervisor app's dedicated POST
   * alias (FR-SV-4.9) — translates APPROVE/REJECT to this service's own
   * COMPLETE/REFILL vocabulary and delegates to the existing decide()
   * unchanged, reusing its roster-scoping IDOR check and PENDING_FOLLOWUP-
   * only guard as-is. Reusing REFILL's existing no-op branch for REJECT is
   * intentional: both mean "no status change, referral stays
   * PENDING_FOLLOWUP" — exactly what "Reject → referral stays Pending, no
   * incentive" asks for.
   *
   * On APPROVE only, resolves the beneficiary's assigned Sakhi and triggers
   * the incentive — best-effort (logged, not thrown), same reasoning as
   * approval-service's decideAccompaniedReferralCard: by the time this runs
   * the referral is already committed COMPLETED with no way back, so a
   * failure here needs manual follow-up, not a failed request that looks
   * like nothing happened.
   */
  async decideAccompanied(
    id: string,
    decision: 'APPROVE' | 'REJECT',
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const updated = await this.decide(
      id,
      { decision: decision === 'APPROVE' ? 'COMPLETE' : 'REFILL' },
      caller,
      authorizationHeader,
    );

    if (decision === 'APPROVE') {
      try {
        const beneficiary = await this.beneficiaryClient.getById(
          updated.beneficiaryId,
          authorizationHeader,
        );
        if (!beneficiary) {
          console.error(
            `Referral ${id} was completed but its beneficiary ${updated.beneficiaryId} was not found — incentive not triggered.`,
          );
        } else {
          await this.incentiveClient.triggerAccompaniedReferral(
            beneficiary.sakhiId,
            id,
            authorizationHeader,
          );
        }
      } catch (err) {
        console.error(
          `Referral ${id} was completed but the incentive trigger failed (referral cannot be re-decided to retry — needs manual follow-up):`,
          err,
        );
      }
    }

    return updated;
  }
}
