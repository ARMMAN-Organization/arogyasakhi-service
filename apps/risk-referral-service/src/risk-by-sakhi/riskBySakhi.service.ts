import { forbidden, type AuthenticatedUser } from '@armman/service-commons';
import type { RiskBySakhiRepository } from './riskBySakhi.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';
import { resolveRiskGrades } from './riskGrade.client';
import type { RiskBySakhiQuery } from './dto/get-risk-by-sakhi.dto';

type AssessmentWithFlagsRow = Awaited<
  ReturnType<RiskBySakhiRepository['findAssessmentsWithFlagsForBeneficiaries']>
>[number];

interface RiskConditionSummaryAcc {
  riskConditionId: string;
  conditionName: string;
  phase: string;
  baselineGrade: string | null;
  baselineObservedValue: unknown;
  baselineAssessedAt: Date;
  latestGrade: string | null;
  latestObservedValue: unknown;
  latestAssessedAt: Date;
  everHighestGrade: string | null;
  everHighestSortOrder: number;
  everAtRiskFlag: boolean;
}

type RiskBySakhiType = NonNullable<RiskBySakhiQuery['type']>;

/**
 * `PNC` has no single agreed RiskPhase mapping elsewhere in this codebase —
 * SRS Appendix J.1 uses "PNC" as the old name for what is now the INC
 * phase, while SRS line 716 treats it as an umbrella for everything after
 * ANC. Fixed here as DELIVERY + PP + NN (the postnatal window for mother and
 * newborn, excluding the later INC/CCV infant-care phases) per product
 * decision.
 */
const PHASES_BY_TYPE: Record<RiskBySakhiType, readonly string[]> = {
  ANC: ['ANC'],
  PNC: ['DELIVERY', 'PP', 'NN'],
};

/**
 * Assembles per-condition risk summaries — same derivation as
 * beneficiary-risk/beneficiaryRisk.service.ts's getRiskState — for every
 * beneficiary on a Sakhi's caseload in one call, optionally filtered to the
 * ANC or PNC phase set. Gives Sakhi/Supervisor-facing screens a roster-wide
 * risk view without one round trip per beneficiary.
 */
export class RiskBySakhiService {
  constructor(
    private readonly repository: RiskBySakhiRepository,
    private readonly beneficiaryClient: BeneficiaryClient = new BeneficiaryClient(),
  ) {}

  async getRiskBySakhi(
    sakhiId: string,
    type: RiskBySakhiQuery['type'],
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    await this.assertCallerCanViewSakhi(sakhiId, caller, authorizationHeader);

    const beneficiaryIds = await this.beneficiaryClient.getIds(authorizationHeader, sakhiId);
    if (beneficiaryIds.length === 0) {
      return { sakhiId, type: type ?? null, beneficiaries: [] };
    }

    const assessments =
      await this.repository.findAssessmentsWithFlagsForBeneficiaries(beneficiaryIds);
    const allowedPhases = type ? PHASES_BY_TYPE[type] : null;

    const hasAnyMatchingFlag = assessments.some((assessment) =>
      assessment.riskFlags.some(
        (flag) => !allowedPhases || allowedPhases.includes(flag.riskCondition.phase),
      ),
    );
    const riskGrades = hasAnyMatchingFlag
      ? await resolveRiskGrades(authorizationHeader)
      : new Map<string, { code: string; sortOrder: number }>();

    const summariesByBeneficiary = this.deriveSummariesByBeneficiary(
      beneficiaryIds,
      assessments,
      allowedPhases,
      riskGrades,
    );

    return {
      sakhiId,
      type: type ?? null,
      beneficiaries: beneficiaryIds.map((beneficiaryId) => ({
        beneficiaryId,
        riskConditionSummaries: [
          ...(summariesByBeneficiary.get(beneficiaryId) ?? new Map()).values(),
        ].map((s) => ({
          riskConditionId: s.riskConditionId,
          conditionName: s.conditionName,
          phase: s.phase,
          baselineGrade: s.baselineGrade,
          baselineObservedValue: s.baselineObservedValue,
          baselineAssessedAt: s.baselineAssessedAt,
          latestGrade: s.latestGrade,
          latestObservedValue: s.latestObservedValue,
          latestAssessedAt: s.latestAssessedAt,
          everHighestGrade: s.everHighestGrade,
          everAtRiskFlag: s.everAtRiskFlag,
        })),
      })),
    };
  }

  /**
   * Same reduction as beneficiaryRisk.service.ts's getRiskState, run once
   * per beneficiary: `assessments` is ordered most-recent-`evaluatedAt`-first
   * (see repository), so the first sighting of a condition fixes `latest*`,
   * and every subsequent (older) sighting overwrites `baseline*`.
   */
  private deriveSummariesByBeneficiary(
    beneficiaryIds: string[],
    assessments: AssessmentWithFlagsRow[],
    allowedPhases: readonly string[] | null,
    riskGrades: Map<string, { code: string; sortOrder: number }>,
  ): Map<string, Map<string, RiskConditionSummaryAcc>> {
    const summariesByBeneficiary = new Map<string, Map<string, RiskConditionSummaryAcc>>(
      beneficiaryIds.map((id) => [id, new Map<string, RiskConditionSummaryAcc>()]),
    );

    for (const assessment of assessments) {
      const summaries = summariesByBeneficiary.get(assessment.beneficiaryId);
      if (!summaries) continue;

      for (const flag of assessment.riskFlags) {
        if (allowedPhases && !allowedPhases.includes(flag.riskCondition.phase)) continue;

        const grade = riskGrades.get(flag.riskGradeLookupValueId);
        const gradeCode = grade?.code ?? null;
        const sortOrder = grade?.sortOrder ?? -1;
        const isAtRisk = gradeCode !== null && gradeCode !== 'NORMAL';

        const existing = summaries.get(flag.riskConditionId);
        if (!existing) {
          summaries.set(flag.riskConditionId, {
            riskConditionId: flag.riskConditionId,
            conditionName: flag.riskCondition.conditionName,
            phase: flag.riskCondition.phase,
            baselineGrade: gradeCode,
            baselineObservedValue: flag.observedValueJson,
            baselineAssessedAt: assessment.evaluatedAt,
            latestGrade: gradeCode,
            latestObservedValue: flag.observedValueJson,
            latestAssessedAt: assessment.evaluatedAt,
            everHighestGrade: gradeCode,
            everHighestSortOrder: sortOrder,
            everAtRiskFlag: isAtRisk,
          });
          continue;
        }

        existing.baselineGrade = gradeCode;
        existing.baselineObservedValue = flag.observedValueJson;
        existing.baselineAssessedAt = assessment.evaluatedAt;
        if (sortOrder > existing.everHighestSortOrder) {
          existing.everHighestGrade = gradeCode;
          existing.everHighestSortOrder = sortOrder;
        }
        if (isAtRisk) existing.everAtRiskFlag = true;
      }
    }

    return summariesByBeneficiary;
  }

  /**
   * IDOR guard: a SAKHI may only query her own sakhiId; a SUPERVISOR only a
   * sakhiId on their own roster (resolved via auth-service); MANAGER/ADMIN
   * are unscoped. Unlike beneficiary-risk's assertCallerCanViewBeneficiary,
   * there's no beneficiary-service lookup here — sakhiId is the caller's own
   * input, not derived from a beneficiary record.
   */
  private async assertCallerCanViewSakhi(
    sakhiId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ): Promise<void> {
    if (caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN')) return;

    if (caller.roles.includes('SUPERVISOR')) {
      if (!caller.projectId) throw forbidden('Supervisor caller has no project scope.');
      const roster = await listSakhiIdsForSupervisor(
        caller.projectId,
        caller.id,
        authorizationHeader,
      );
      if (!roster.includes(sakhiId)) {
        throw forbidden("This Sakhi is outside this Supervisor's roster.");
      }
      return;
    }

    if (sakhiId !== caller.id) {
      throw forbidden('You do not have access to this Sakhi.');
    }
  }
}
