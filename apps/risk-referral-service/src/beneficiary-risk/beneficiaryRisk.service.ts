import type { BeneficiaryRiskRepository } from './beneficiaryRisk.repository';

type StateSnapshotRow = Awaited<
  ReturnType<BeneficiaryRiskRepository['findStateSnapshots']>
>[number];

type AssessmentWithFlagsRow = Awaited<
  ReturnType<BeneficiaryRiskRepository['findAssessmentsWithFlags']>
>[number];

/**
 * Assembles a beneficiary's risk profile for the reference Android app's
 * "Beneficiary Data Download" screen — a pure read projection over this
 * service's own risk_state_snapshots/risk_assessments/risk_flags tables, no
 * writes and no cross-service calls. Not part of the SRS/ERD/HLD; reverse
 * engineered from that reference app.
 */
export class BeneficiaryRiskService {
  constructor(private readonly repository: BeneficiaryRiskRepository) {}

  /**
   * Returns `{ beneficiaryId, currentState, assessments }`. Does not check
   * whether the beneficiary itself exists (this service owns no
   * beneficiary_cases row to check against, and querying beneficiary-service
   * for that alone would add a cross-service call this endpoint doesn't
   * otherwise need) — an unknown/foreign beneficiaryId simply yields empty
   * `currentState`/`assessments` arrays rather than a 404.
   */
  async getRiskProfile(beneficiaryId: string) {
    const [snapshots, assessments] = await Promise.all([
      this.repository.findStateSnapshots(beneficiaryId),
      this.repository.findAssessmentsWithFlags(beneficiaryId),
    ]);

    return {
      beneficiaryId,
      currentState: this.toCurrentStatePerPhase(snapshots),
      assessments: assessments.map((assessment) => this.toAssessmentView(assessment)),
    };
  }

  /**
   * Reduces the beneficiary's full RiskStateSnapshot history to one row per
   * `phase` — the most recent by `asOfDate`. RiskStateSnapshot has no
   * uniqueness constraint on (beneficiaryId, phase): a phase gets a new
   * snapshot row each time it's re-evaluated, so the raw table can hold
   * several rows per phase. `currentState` is meant to answer "what is this
   * beneficiary's risk state *right now*, per phase" — the full history is
   * already covered by the `assessments` field, so returning every row here
   * would just duplicate it under a misleading name. Relies on `snapshots`
   * already being sorted `asOfDate` desc (see repository), so the first row
   * seen per phase is kept.
   */
  private toCurrentStatePerPhase(snapshots: StateSnapshotRow[]): StateSnapshotRow[] {
    const mostRecentByPhase = new Map<string, StateSnapshotRow>();
    for (const snapshot of snapshots) {
      if (!mostRecentByPhase.has(snapshot.phase)) {
        mostRecentByPhase.set(snapshot.phase, snapshot);
      }
    }
    return [...mostRecentByPhase.values()];
  }

  /** Flattens each RiskFlag's nested RiskCondition into conditionCode/conditionName. */
  private toAssessmentView(assessment: AssessmentWithFlagsRow) {
    return {
      id: assessment.id,
      evaluatedAt: assessment.evaluatedAt,
      overallRiskCategory: assessment.overallRiskCategory,
      overallHighRiskFlag: assessment.overallHighRiskFlag,
      hrDetectedFlag: assessment.hrDetectedFlag,
      flags: assessment.riskFlags.map((flag) => ({
        id: flag.id,
        conditionCode: flag.riskCondition.conditionCode,
        conditionName: flag.riskCondition.conditionName,
        riskGradeLookupValueId: flag.riskGradeLookupValueId,
        observedValueJson: flag.observedValueJson,
        isReferralTrigger: flag.isReferralTrigger,
        isEducationTrigger: flag.isEducationTrigger,
        isHrVisitTrigger: flag.isHrVisitTrigger,
      })),
    };
  }
}
