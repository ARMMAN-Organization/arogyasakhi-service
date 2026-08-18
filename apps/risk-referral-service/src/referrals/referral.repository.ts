import type { PrismaService } from '../prisma/prisma.service';
import type { CreateReferralInput } from './dto/create-referral.dto';

/** Data access for referrals. Owns only this service's `referrals` table. */
export class ReferralRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.referral.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  findById(id: string) {
    return this.prisma.referral.findFirst({ where: { id, isDeleted: false } });
  }

  create(data: CreateReferralInput) {
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
   */
  async updateStatus(
    id: string,
    fromStatus: 'PENDING_FOLLOWUP',
    toStatus: 'LAPSED' | 'COMPLETED',
  ): Promise<boolean> {
    const result = await this.prisma.referral.updateMany({
      where: { id, isDeleted: false, status: fromStatus },
      data: { status: toStatus },
    });
    return result.count > 0;
  }
}
