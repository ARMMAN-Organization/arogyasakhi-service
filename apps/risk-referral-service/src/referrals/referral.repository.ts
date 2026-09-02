import type { PrismaService } from '../prisma/prisma.service';
import type { CreateReferralInput } from './dto/create-referral.dto';

/** Data access for referrals. Owns only this service's `referrals` table. */
export class ReferralRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Most-recent-50 referrals, optionally scoped to one `beneficiaryId` — the
   * beneficiary-scoped case backs a beneficiary detail screen's referral
   * history; omitting it keeps the existing unfiltered behavior.
   */
  findMany(beneficiaryId?: string) {
    return this.prisma.referral.findMany({
      where: beneficiaryId ? { beneficiaryId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  findById(id: string) {
    return this.prisma.referral.findFirst({ where: { id, isDeleted: false } });
  }

  /**
   * The existing referral for a visitId, if any — used by create()'s
   * idempotent-return-existing path after a visit_referral_once collision.
   * Only ever called with a non-null visitId (visitId: null referrals are
   * unrestricted by that constraint, so a collision can't happen for them).
   */
  findByVisitId(visitId: string) {
    return this.prisma.referral.findFirst({ where: { visitId, isDeleted: false } });
  }

  /**
   * Incomplete-followup count and the most recent followup's own
   * notVisitedReason/outcome for one referral — for Quick Response's
   * REFERRAL_INCOMPLETE card enrichment ("# referrals missed", "reason").
   * Returns `latestFollowup: null` when the referral has no followups yet.
   */
  async findFollowupSummary(referralId: string) {
    const [incompleteCount, latest] = await Promise.all([
      this.prisma.referralFollowup.count({
        where: { referralId, isDeleted: false, followupStatus: 'INCOMPLETE' },
      }),
      this.prisma.referralFollowup.findFirst({
        where: { referralId, isDeleted: false },
        orderBy: { followupDate: 'desc' },
        select: { followupDate: true, notVisitedReason: true, outcome: true },
      }),
    ]);

    return { incompleteCount, latestFollowup: latest };
  }

  /**
   * Real-time status for a batch of referral ids — lets Quick Response's
   * list() reconcile against the current decision state instead of
   * trusting approval_requests' own (possibly stale) copy, since a
   * referral can also be decided directly via PATCH/POST
   * /referrals/:id/decision, bypassing approval-service entirely. An id
   * not found (or soft-deleted) is simply absent from the result.
   */
  findManyByIds(ids: string[]) {
    return this.prisma.referral.findMany({
      where: { id: { in: ids }, isDeleted: false },
      select: { id: true, status: true, beneficiaryId: true },
    });
  }

  /**
   * `validTill` is not part of CreateReferralInput (the request DTO) — it's
   * server-computed by ReferralService.create() and passed in here
   * separately, never caller-supplied.
   */
  create(data: CreateReferralInput & { validTill: Date }) {
    return this.prisma.referral.create({ data });
  }

  /**
   * Counts, for the Referral Summary widget: accompanied referrals (status
   * ACCOMPANIED per referralTypeLookupValueId) and pending follow-ups
   * (a ReferralFollowup with followupStatus PENDING), both restricted to
   * `beneficiaryIds` — the in-scope set resolved by the caller via
   * beneficiary-service, since referrals carries no sakhiId column of its
   * own. `beneficiaryIds: undefined` means unscoped (MANAGER/ADMIN).
   */
  async countSummary(
    beneficiaryIds: string[] | undefined,
    accompaniedLookupValueId: string | null,
  ) {
    const beneficiaryScope = beneficiaryIds ? { beneficiaryId: { in: beneficiaryIds } } : {};

    const [accompaniedReferralsCount, pendingFollowUpsCount] = await Promise.all([
      accompaniedLookupValueId === null
        ? Promise.resolve(0)
        : this.prisma.referral.count({
            where: {
              ...beneficiaryScope,
              isDeleted: false,
              referralTypeLookupValueId: accompaniedLookupValueId,
            },
          }),
      this.prisma.referralFollowup.count({
        where: {
          isDeleted: false,
          followupStatus: 'PENDING',
          referral: { ...beneficiaryScope, isDeleted: false },
        },
      }),
    ]);

    return { accompaniedReferralsCount, pendingFollowUpsCount };
  }

  /**
   * Pending-follow-up counts per beneficiaryId, split into pendingCount
   * (all PENDING follow-ups) and overdueCount (PENDING follow-ups whose
   * followupDate has already passed `today`) — for the pada-breakdown
   * widget, whose referralFollowUp.*OverdueCount fields need this
   * per-beneficiary split before the caller (api-gateway) sums by
   * caseType. Grouped in application code, not a Prisma groupBy, since
   * followupStatus/followupDate live on ReferralFollowup but beneficiaryId
   * lives on its parent Referral — Prisma cannot group by a related
   * model's field directly. An empty `beneficiaryIds` returns an empty map.
   */
  async countPendingFollowupsByBeneficiary(
    beneficiaryIds: string[],
    today: Date,
  ): Promise<Map<string, { pendingCount: number; overdueCount: number }>> {
    if (beneficiaryIds.length === 0) return new Map();

    const rows = await this.prisma.referralFollowup.findMany({
      where: {
        isDeleted: false,
        followupStatus: 'PENDING',
        referral: { beneficiaryId: { in: beneficiaryIds }, isDeleted: false },
      },
      select: { followupDate: true, referral: { select: { beneficiaryId: true } } },
    });

    const byBeneficiary = new Map<string, { pendingCount: number; overdueCount: number }>();
    for (const row of rows) {
      const beneficiaryId = row.referral.beneficiaryId;
      const entry = byBeneficiary.get(beneficiaryId) ?? { pendingCount: 0, overdueCount: 0 };
      entry.pendingCount += 1;
      if (row.followupDate < today) entry.overdueCount += 1;
      byBeneficiary.set(beneficiaryId, entry);
    }
    return byBeneficiary;
  }

  /**
   * Full PENDING follow-up rows (id, beneficiaryId, followupDate) for the
   * given beneficiaries — for the pada visit-list screen's
   * "referral_follow_up" tab. Unfiltered by date: a pending follow-up
   * doesn't disappear from this list just because its date passed or
   * hasn't arrived yet — this is an ongoing task list, not a daily
   * schedule (unlike the "open"/visit tab, which IS date-filtered). An
   * empty `beneficiaryIds` returns an empty list (not an error).
   */
  async findFollowupsByBeneficiary(beneficiaryIds: string[]) {
    if (beneficiaryIds.length === 0) return [];
    return this.prisma.referralFollowup.findMany({
      where: {
        isDeleted: false,
        followupStatus: 'PENDING',
        referral: { beneficiaryId: { in: beneficiaryIds }, isDeleted: false },
      },
      select: { id: true, followupDate: true, referral: { select: { beneficiaryId: true } } },
    });
  }

  /**
   * Only updates a row that is still in `fromStatus` — `updateMany`'s
   * affected count (rather than a separate read-then-write) is the
   * concurrency guard: if the referral's status already changed between the
   * caller's `findById` and this call, the count comes back 0 and the
   * service turns that into a 409 instead of silently overwriting a
   * since-changed referral. Same pattern as closures/reopen-requests.
   *
   * Sets the decision audit trail (decidedByUserId/decidedAt/decisionNotes)
   * atomically with the status change, for the LAPSE/COMPLETE decisions —
   * mirrors ReopenRequest's own decision-audit fields.
   */
  async updateStatus(
    id: string,
    fromStatus: 'PENDING_FOLLOWUP',
    toStatus: 'LAPSED' | 'COMPLETED',
    decision: { decidedByUserId: string; decidedAt: Date; decisionNotes: string | null },
  ): Promise<boolean> {
    const result = await this.prisma.referral.updateMany({
      where: { id, isDeleted: false, status: fromStatus },
      data: { status: toStatus, ...decision },
    });
    return result.count > 0;
  }

  /**
   * Records a REFILL decision's audit trail without changing `status` — the
   * REFILL business rule is "referral stays PENDING_FOLLOWUP". Uses the same
   * conditional-updateMany-as-concurrency-guard pattern as updateStatus
   * (fixed per security review, 2026-09-02): the caller's own
   * `existing.status === 'PENDING_FOLLOWUP'` check reads a snapshot taken
   * before any SUPERVISOR-roster-scoping HTTP call, not immediately before
   * this write, so two concurrent decisions on the same referral could
   * previously race — an unconditional `update` here would silently
   * overwrite decidedByUserId/decidedAt/decisionNotes with the loser's
   * values after a status-changing decide() had already committed, with no
   * 409 to signal it. Gated on status: 'PENDING_FOLLOWUP' now, same as
   * updateStatus, so that race correctly 409s instead.
   */
  async updateDecisionOnly(
    id: string,
    decision: { decidedByUserId: string; decidedAt: Date; decisionNotes: string | null },
  ): Promise<boolean> {
    const result = await this.prisma.referral.updateMany({
      where: { id, isDeleted: false, status: 'PENDING_FOLLOWUP' },
      data: decision,
    });
    return result.count > 0;
  }

  /**
   * Converts a referral's type (Standard -> Accompanied) — only updates a
   * row still at `fromReferralTypeLookupValueId` and still PENDING_FOLLOWUP,
   * same updateMany-as-concurrency-guard pattern as updateStatus: a 0
   * affected-count means the referral was already converted/decided between
   * the caller's read and this call, and the service turns that into a 409
   * rather than silently overwriting a since-changed referral.
   */
  async updateType(
    id: string,
    fromReferralTypeLookupValueId: string,
    toReferralTypeLookupValueId: string,
  ): Promise<boolean> {
    const result = await this.prisma.referral.updateMany({
      where: {
        id,
        isDeleted: false,
        status: 'PENDING_FOLLOWUP',
        referralTypeLookupValueId: fromReferralTypeLookupValueId,
      },
      data: { referralTypeLookupValueId: toReferralTypeLookupValueId },
    });
    return result.count > 0;
  }
}
