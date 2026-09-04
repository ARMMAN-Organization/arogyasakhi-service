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
  // The caller's FORM_CODE_TO_RISK_PHASE-derived phase for this submission —
  // see schema.prisma's RiskAssessment.riskPhase doc comment for why this is
  // persisted (stage-appropriate health-education message selection).
  riskPhase: RiskPhase;
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
   * Every RiskAssessment for the given visit ids, most-recently-evaluated
   * first — used by callers that already know which visits they care about
   * (e.g. BR-13's "last 3 completed INC visits" lookup, resolved by
   * visit-form-service since it owns visit typing; risk-referral-service
   * doesn't own visit_instances/visit_schedules, no cross-service join per
   * the forklift rule, so it can only filter by an id list handed to it).
   * An empty `visitIds` short-circuits to an empty array without querying.
   */
  async findByVisitIds(beneficiaryId: string, visitIds: string[]) {
    if (visitIds.length === 0) return [];
    return this.prisma.riskAssessment.findMany({
      where: { beneficiaryId, visitId: { in: visitIds }, isDeleted: false },
      orderBy: { evaluatedAt: 'desc' },
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
   *
   * One batched query for every condition code (not one query per code —
   * see PR #172 review) — each condition needs at most its 4 most recent
   * flags, so this over-fetches per condition (no per-condition LIMIT is
   * expressible in a single findMany) and trims to 4 in JS afterward, which
   * is still one round trip regardless of how many conditionCodes are
   * passed.
   */
  async findConsecutiveNoImprovementCount(
    beneficiaryId: string,
    conditionCodes: string[],
  ): Promise<Map<string, number>> {
    if (conditionCodes.length === 0) return new Map();

    const flags = await this.prisma.riskFlag.findMany({
      where: {
        riskAssessment: { beneficiaryId, isDeleted: false },
        riskCondition: { conditionCode: { in: conditionCodes } },
      },
      orderBy: { createdAt: 'desc' },
      select: { gradeRank: true, riskCondition: { select: { conditionCode: true } } },
    });

    const flagsByCode = new Map<string, number[]>();
    for (const flag of flags) {
      const code = flag.riskCondition.conditionCode;
      const ranks = flagsByCode.get(code);
      if (ranks) {
        if (ranks.length < 4) ranks.push(flag.gradeRank);
      } else {
        flagsByCode.set(code, [flag.gradeRank]);
      }
    }

    const result = new Map<string, number>();
    for (const conditionCode of conditionCodes) {
      const ranks = flagsByCode.get(conditionCode) ?? [];
      let streak = 0;
      for (let i = 0; i < ranks.length - 1; i++) {
        if (ranks[i] < ranks[i + 1]) break;
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
          riskPhase: data.riskPhase,
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
