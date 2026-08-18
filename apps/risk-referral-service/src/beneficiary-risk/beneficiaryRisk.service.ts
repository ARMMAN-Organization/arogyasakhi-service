import { forbidden, notFound, type AuthenticatedUser } from '@armman/service-commons';
import type { BeneficiaryRiskRepository } from './beneficiaryRisk.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';

type StateSnapshotRow = Awaited<
  ReturnType<BeneficiaryRiskRepository['findStateSnapshots']>
>[number];

type AssessmentWithFlagsRow = Awaited<
  ReturnType<BeneficiaryRiskRepository['findAssessmentsWithFlags']>
>[number];

/**
 * Assembles a beneficiary's risk profile for the reference Android app's
 * "Beneficiary Data Download" screen — a read projection over this
 * service's own risk_state_snapshots/risk_assessments/risk_flags tables,
 * plus one cross-service call to beneficiary-service to enforce ownership
 * (see getRiskProfile). Not part of the SRS/ERD/HLD; reverse engineered
 * from that reference app.
 */
export class BeneficiaryRiskService {
  constructor(
    private readonly repository: BeneficiaryRiskRepository,
    private readonly beneficiaryClient: BeneficiaryClient = new BeneficiaryClient(),
  ) {}

  /**
   * Returns `{ beneficiaryId, currentState, assessments }`. A SAKHI caller
   * may only read her own beneficiary's risk profile; a SUPERVISOR only a
   * beneficiary whose assigned Sakhi is on their own roster. MANAGER/ADMIN
   * are unscoped. Resolves ownership via beneficiary-service (this service
   * owns no beneficiary_cases row of its own) — same IDOR guard
   * `referrals/referral.service.ts`'s `decide` applies to its single-record
   * mutation, applied here to a single-record read instead. A beneficiaryId
   * beneficiary-service doesn't recognize 404s rather than silently
   * returning empty arrays, since an unscoped caller could otherwise use an
   * all-empty response to distinguish "no risk data" from "not mine to see."
   */
  async getRiskProfile(
    beneficiaryId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const isUnscoped = caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
    if (!isUnscoped) {
      const beneficiary = await this.beneficiaryClient.getById(beneficiaryId, authorizationHeader);
      if (!beneficiary) throw notFound('Beneficiary not found.');

      if (caller.roles.includes('SUPERVISOR')) {
        if (!caller.projectId) throw forbidden('Supervisor caller has no project scope.');
        const roster = await listSakhiIdsForSupervisor(
          caller.projectId,
          caller.id,
          authorizationHeader,
        );
        if (!roster.includes(beneficiary.sakhiId)) {
          throw forbidden("This beneficiary is outside this Supervisor's roster.");
        }
      } else if (beneficiary.sakhiId !== caller.id) {
        throw forbidden('You do not have access to this beneficiary.');
      }
    }

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
