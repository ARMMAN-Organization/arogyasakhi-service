import type {
  Prisma,
  RiskPhase,
} from '../../../../node_modules/.prisma/client-risk-referral-service';
import type { PrismaService } from '../prisma/prisma.service';

export interface RiskFlagCreateData {
  riskConditionId: string;
  riskGradeLookupValueId: string;
  gradeRank: number;
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
   * Maps risk_conditions.condition_code -> risk_condition_id for every
   * ACTIVE condition in `phase` — a rule pack's own conditionCodes are
   * portable across environments, but the decision graph's output must
   * carry a real DB id (see ruleSet.evaluator.ts's RiskEvaluationResult
   * contract), so the caller resolves this map once per evaluation and
   * passes it into the rule pack as an input (see anc-risk.rulesJson.ts's
   * `conditionIds`). Scoped by phase alone (not a fixed code list) so this
   * stays correct as more phases (PP/NN/INC/CCV) get their own seeded
   * RiskCondition rows and rule packs, with no code change here.
   */
  async findConditionIdsByPhase(phase: RiskPhase): Promise<Map<string, string>> {
    const conditions = await this.prisma.riskCondition.findMany({
      where: { phase, status: 'ACTIVE', isDeleted: false },
      select: { id: true, conditionCode: true },
    });
    return new Map(conditions.map((c) => [c.conditionCode, c.id]));
  }

  /**
   * Condition codes that have EVER been graded above NORMAL for this
   * beneficiary, across every past assessment/phase — used to resolve the
   * "only first instance" trigger gate (Appendix D §D.4/§D.5: Age, MUAC/BMI,
   * Stunting, Bad Obstetric History, Gestational Weight Gain, Jaundice).
   * Deliberately unbounded by phase/pregnancy window — a condition flagged
   * once is never "first instance" again for that beneficiary.
   *
   * RiskFlag has no scalar grade column (grade lives behind
   * riskGradeLookupValueId, owned by auth-service — no cross-service join),
   * so "was this condition ever non-NORMAL" is inferred via
   * isEducationTrigger, which anc-risk.rulesJson.ts sets to `grade !==
   * 'NORMAL'` unconditionally (never gated by first-instance), unlike
   * isReferralTrigger/isHrVisitTrigger which this very lookup feeds into.
   */
  async findEverFlaggedConditionCodes(beneficiaryId: string): Promise<Set<string>> {
    const flags = await this.prisma.riskFlag.findMany({
      where: {
        riskAssessment: { beneficiaryId, isDeleted: false },
        isEducationTrigger: true,
      },
      select: { riskCondition: { select: { conditionCode: true } } },
    });
    return new Set(flags.map((f) => f.riskCondition.conditionCode));
  }

  /**
   * For each of `conditionCodes`, how many of that condition's most recent
   * consecutive visit-flags show no improvement (gradeRank did not
   * decrease) — used for the infant nutrition conditions' "on first
   * instance, and if no improvement in 3 consecutive visits" referral rule
   * (Appendix D §2.4). Streak breaks (resets the count read here) the
   * moment gradeRank decreases from one flag to the next-most-recent one;
   * a flat or worsening trend keeps counting. Capped at 3 visits back since
   * the rule pack only needs to know ">=3", not the exact streak length.
   */
  async findConsecutiveNoImprovementCount(
    beneficiaryId: string,
    conditionCodes: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const conditionCode of conditionCodes) {
      const flags = await this.prisma.riskFlag.findMany({
        where: {
          riskAssessment: { beneficiaryId, isDeleted: false },
          riskCondition: { conditionCode },
        },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { gradeRank: true },
      });
      let streak = 0;
      for (let i = 0; i < flags.length - 1; i++) {
        if (flags[i].gradeRank < flags[i + 1].gradeRank) break;
        streak += 1;
      }
      result.set(conditionCode, streak);
    }
    return result;
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
          gradeRank: flag.gradeRank,
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
