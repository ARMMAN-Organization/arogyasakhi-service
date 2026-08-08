import type { Prisma } from '../../../../node_modules/.prisma/client-risk-referral-service';
import type { PrismaService } from '../prisma/prisma.service';

export interface RiskFlagCreateData {
  riskConditionId: string;
  riskGradeLookupValueId: string;
  observedValueJson: Prisma.InputJsonValue | null;
  isReferralTrigger: boolean;
  isEducationTrigger: boolean;
  isHrVisitTrigger: boolean;
}

export interface RiskAssessmentCreateData {
  beneficiaryId: string;
  visitId: string | null;
  submissionId: string;
  ruleVersionId: string;
  evaluatedAt: Date;
  overallRiskCategory: 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  overallHighRiskFlag: boolean;
  hrDetectedFlag: boolean;
  flags: RiskFlagCreateData[];
}

/** Data access for risk assessments/flags. Owns only this service's `risk_*` tables. */
export class RiskAssessmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The `phase` for each of the given risk_conditions ids, keyed by id —
   * needed to push the correct SummaryPhase-equivalent to beneficiary-service
   * (see riskAssessment.service.ts's RISK_PHASE_TO_SUMMARY_PHASE mapping).
   */
  async findPhasesByConditionIds(riskConditionIds: string[]): Promise<Map<string, string>> {
    const conditions = await this.prisma.riskCondition.findMany({
      where: { id: { in: riskConditionIds } },
      select: { id: true, phase: true },
    });
    return new Map(conditions.map((c) => [c.id, c.phase]));
  }

  /** Existing assessment for a submissionId, or null — used for idempotent replay. */
  findBySubmissionId(submissionId: string) {
    return this.prisma.riskAssessment.findFirst({
      where: { submissionId, isDeleted: false },
      include: { riskFlags: true },
    });
  }

  /**
   * Creates one RiskAssessment and its RiskFlag rows in a single
   * transaction — the two must never exist independently (a RiskAssessment
   * with zero flags, or flags with no parent assessment, are both
   * inconsistent states per the ERD's condition-level/visit-level summary
   * split).
   */
  create(data: RiskAssessmentCreateData) {
    return this.prisma.$transaction(async (tx) => {
      const assessment = await tx.riskAssessment.create({
        data: {
          beneficiaryId: data.beneficiaryId,
          visitId: data.visitId,
          submissionId: data.submissionId,
          ruleVersionId: data.ruleVersionId,
          evaluatedAt: data.evaluatedAt,
          overallRiskCategory: data.overallRiskCategory,
          overallHighRiskFlag: data.overallHighRiskFlag,
          hrDetectedFlag: data.hrDetectedFlag,
        },
      });

      await tx.riskFlag.createMany({
        data: data.flags.map((flag) => ({
          riskAssessmentId: assessment.id,
          riskConditionId: flag.riskConditionId,
          riskGradeLookupValueId: flag.riskGradeLookupValueId,
          observedValueJson: flag.observedValueJson ?? undefined,
          isReferralTrigger: flag.isReferralTrigger,
          isEducationTrigger: flag.isEducationTrigger,
          isHrVisitTrigger: flag.isHrVisitTrigger,
        })),
      });

      return tx.riskAssessment.findUniqueOrThrow({
        where: { id: assessment.id },
        include: { riskFlags: true },
      });
    });
  }
}
