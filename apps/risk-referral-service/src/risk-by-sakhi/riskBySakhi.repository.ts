import type { PrismaService } from '../prisma/prisma.service';

const ASSESSMENT_WITH_FLAGS_SELECT = {
  id: true,
  beneficiaryId: true,
  evaluatedAt: true,
  overallRiskCategory: true,
  overallHighRiskFlag: true,
  hrDetectedFlag: true,
  riskFlags: {
    select: {
      id: true,
      riskConditionId: true,
      riskGradeLookupValueId: true,
      observedValueJson: true,
      isReferralTrigger: true,
      isEducationTrigger: true,
      isHrVisitTrigger: true,
      riskCondition: { select: { conditionCode: true, conditionName: true, phase: true } },
    },
  },
} as const;

/**
 * Data access for the risk-by-sakhi roster view. Read-only projection over
 * this service's own `risk_assessments`/`risk_flags` tables — no
 * cross-service joins (forklift rule).
 */
export class RiskBySakhiRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every non-deleted RiskAssessment row for any of the given beneficiaries,
   * most recent `evaluatedAt` first, with each assessment's RiskFlag rows
   * and each flag's RiskCondition (for conditionCode/conditionName/phase)
   * nested in the same round trip — avoids N+1 queries. Same select shape as
   * beneficiary-risk/beneficiaryRisk.repository.ts's
   * findAssessmentsWithFlags, batched across beneficiaries instead of one.
   */
  findAssessmentsWithFlagsForBeneficiaries(beneficiaryIds: string[]) {
    return this.prisma.riskAssessment.findMany({
      where: { beneficiaryId: { in: beneficiaryIds }, isDeleted: false },
      orderBy: { evaluatedAt: 'desc' },
      select: ASSESSMENT_WITH_FLAGS_SELECT,
    });
  }
}
