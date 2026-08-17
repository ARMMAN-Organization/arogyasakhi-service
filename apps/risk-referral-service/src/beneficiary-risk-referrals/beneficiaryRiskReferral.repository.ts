import type { PrismaService } from '../prisma/prisma.service';

const REFERRAL_HEADER_SELECT = {
  id: true,
  beneficiaryId: true,
  visitId: true,
  referralTypeLookupValueId: true,
  referralDate: true,
  facilityType: true,
  facilityName: true,
  status: true,
  validTill: true,
  supervisorApprovalStatus: true,
} as const;

const REFERRAL_DETAILS_SELECT = {
  id: true,
  referralFollowups: {
    where: { isDeleted: false },
    orderBy: { followupDate: 'desc' },
    select: {
      id: true,
      followupDate: true,
      visitedFacilityFlag: true,
      notVisitedReason: true,
      diagnosis: true,
      treatmentGiven: true,
      outcome: true,
      casePaperMediaId: true,
      followupStatus: true,
    },
  },
  referralTriggerSources: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      riskFlagId: true,
      riskConditionId: true,
      sourceSubmissionId: true,
      sourceFieldCode: true,
      triggerReason: true,
    },
  },
} as const;

/**
 * Data access for a beneficiary's risk referrals. Owns only this service's
 * `referrals`/`referral_followups`/`Referral_trigger_sources` tables — no
 * cross-service joins.
 */
export class BeneficiaryRiskReferralRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Header" rows only (no followups/triggerSources) for the beneficiary's
   * referrals, most recent `referralDate` first — the separate details
   * endpoint (`findDetailsById`) is what carries the followup/trigger-source
   * detail for a single referral.
   */
  findHeadersByBeneficiary(beneficiaryId: string) {
    return this.prisma.referral.findMany({
      where: { beneficiaryId, isDeleted: false },
      orderBy: { referralDate: 'desc' },
      select: REFERRAL_HEADER_SELECT,
    });
  }

  /**
   * A single referral's followups + trigger sources, scoped to both
   * `referralId` and `beneficiaryId` in one query — a referralId that
   * exists but belongs to a different beneficiary returns null exactly like
   * one that doesn't exist at all, so the service can 404 either case
   * identically without leaking whether the id exists under another
   * beneficiary (IDOR guard). Both nested relations are fetched in the same
   * round trip — no N+1.
   */
  findDetailsById(beneficiaryId: string, referralId: string) {
    return this.prisma.referral.findFirst({
      where: { id: referralId, beneficiaryId, isDeleted: false },
      select: REFERRAL_DETAILS_SELECT,
    });
  }
}
