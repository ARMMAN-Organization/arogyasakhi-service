import type { PrismaService } from '../prisma/prisma.service';

const STATE_SNAPSHOT_SELECT = {
  id: true,
  beneficiaryId: true,
  phase: true,
  asOfDate: true,
  ccvState: true,
  createdAt: true,
} as const;

const ASSESSMENT_WITH_FLAGS_SELECT = {
  id: true,
  evaluatedAt: true,
  // Which visit phase this assessment came from (ANC/PP/NN/...) — needed to
  // pick the stage-appropriate health-education message for a risk-graded
  // condition (see beneficiaryRisk.service.ts's toAssessmentView). Nullable
  // on assessments created before this column existed.
  riskPhase: true,
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
 * Data access for a beneficiary's risk profile. Read-only projection over
 * this service's own `risk_state_snapshots`/`risk_assessments`/`risk_flags`
 * tables — no cross-service joins (forklift rule).
 */
export class BeneficiaryRiskRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every non-deleted RiskStateSnapshot row for the beneficiary, most recent
   * `asOfDate` first. A beneficiary accumulates one row per phase per
   * re-evaluation, so this can contain several rows per phase — the service
   * layer reduces this to "most recent per phase" for the `currentState`
   * response field.
   */
  findStateSnapshots(beneficiaryId: string) {
    return this.prisma.riskStateSnapshot.findMany({
      where: { beneficiaryId, isDeleted: false },
      orderBy: { asOfDate: 'desc' },
      select: STATE_SNAPSHOT_SELECT,
    });
  }

  /**
   * Every non-deleted RiskAssessment row for the beneficiary, most recent
   * `evaluatedAt` first, with each assessment's RiskFlag rows and each
   * flag's RiskCondition (for the human-readable conditionCode/conditionName)
   * nested in the same round trip — avoids N+1 queries.
   */
  findAssessmentsWithFlags(beneficiaryId: string) {
    return this.prisma.riskAssessment.findMany({
      where: { beneficiaryId, isDeleted: false },
      orderBy: { evaluatedAt: 'desc' },
      select: ASSESSMENT_WITH_FLAGS_SELECT,
    });
  }
}
