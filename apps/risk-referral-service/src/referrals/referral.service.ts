import { conflict, forbidden, notFound, type AuthenticatedUser } from '@armman/service-commons';
import type { ReferralRepository } from './referral.repository';
import type { CreateReferralInput } from './dto/create-referral.dto';
import type { DecideReferralInput } from './dto/decide-referral.dto';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';
import { resolveReferralTypeLookupId } from './lookup.client';
import { IncentiveClient } from './incentive.client';

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

  create(dto: CreateReferralInput) {
    return this.repository.create(dto);
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
