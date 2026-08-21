import { forbidden, notFound, type AuthenticatedUser } from '@armman/service-commons';
import type { BeneficiaryRiskRepository } from './beneficiaryRisk.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';
import { resolveRiskGrades } from './riskGrade.client';

type StateSnapshotRow = Awaited<
  ReturnType<BeneficiaryRiskRepository['findStateSnapshots']>
>[number];

type AssessmentWithFlagsRow = Awaited<
  ReturnType<BeneficiaryRiskRepository['findAssessmentsWithFlags']>
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
    // TEMPORARY — timing instrumentation for the GET /beneficiaries/{id}/risk
    // performance investigation. Remove once a real timing breakdown has
    // been captured against the same ngrok-tunneled dev environment the
    // original 9-14s field measurements came from (see the perf writeup's
    // "What's still needed" section) and a decision is made on further work.
    const t0 = Date.now();
    await this.assertCallerCanViewBeneficiary(beneficiaryId, caller, authorizationHeader);
    const t1 = Date.now();

    const [snapshots, assessments] = await Promise.all([
      this.repository.findStateSnapshots(beneficiaryId),
      this.repository.findAssessmentsWithFlags(beneficiaryId),
    ]);
    const t2 = Date.now();

    console.log(
      JSON.stringify({
        label: 'getRiskProfile.timing',
        beneficiaryId,
        ownershipCheckMs: t1 - t0,
        dbQueryMs: t2 - t1,
        totalMs: t2 - t0,
      }),
    );

    return {
      beneficiaryId,
      currentState: this.toCurrentStatePerPhase(snapshots),
      assessments: assessments.map((assessment) => this.toAssessmentView(assessment)),
    };
  }

  /**
   * A beneficiary's per-condition risk history — one row per
   * `riskConditionId`, derived from every RiskFlag ever recorded across all
   * of this beneficiary's assessments (not just the latest one), per the
   * HLD's `GET /beneficiaries/:id/risk-state`. There is no dedicated
   * baseline/ever-highest tracking table in this service (that lives in
   * beneficiary-service's currently-unpopulated
   * beneficiary_risk_condition_summary — see this method's callers for why
   * that path isn't used instead): `baselineGrade` is approximated as the
   * earliest flag on record for that condition in this environment, not
   * necessarily the beneficiary's true registration-time baseline if older
   * assessments existed before this data was captured.
   */
  async getRiskState(
    beneficiaryId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    await this.assertCallerCanViewBeneficiary(beneficiaryId, caller, authorizationHeader);

    const assessments = await this.repository.findAssessmentsWithFlags(beneficiaryId);
    if (assessments.every((assessment) => assessment.riskFlags.length === 0)) {
      return { beneficiaryId, riskConditionSummaries: [] };
    }

    const riskGrades = await resolveRiskGrades(authorizationHeader);
    const summaries = new Map<string, RiskConditionSummaryAcc>();

    // `assessments` is ordered most-recent-`evaluatedAt`-first (see
    // repository) — walked in that order, the FIRST time a condition is
    // seen fixes `latest*`, and every subsequent (older) sighting overwrites
    // `baseline*`, so it ends on the chronologically earliest one seen.
    for (const assessment of assessments) {
      for (const flag of assessment.riskFlags) {
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

    return {
      beneficiaryId,
      riskConditionSummaries: [...summaries.values()].map((s) => ({
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
    };
  }

  /**
   * Shared IDOR guard for both getRiskProfile and getRiskState: a SAKHI
   * caller may only view her own beneficiary; a SUPERVISOR only a
   * beneficiary whose assigned Sakhi is on their own roster; MANAGER/ADMIN
   * are unscoped. Resolves ownership via beneficiary-service (this service
   * owns no beneficiary_cases row of its own). A beneficiaryId
   * beneficiary-service doesn't recognize 404s rather than silently
   * returning empty data, since an unscoped caller could otherwise use an
   * empty response to distinguish "no risk data" from "not mine to see."
   */
  private async assertCallerCanViewBeneficiary(
    beneficiaryId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ): Promise<void> {
    const isUnscoped = caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
    if (isUnscoped) return;

    // The roster fetch doesn't depend on the beneficiary lookup's result —
    // run both cross-service round trips concurrently rather than
    // sequentially (see the GET /beneficiaries/{id}/risk performance
    // writeup: this endpoint measured 9-14s in the field, largely from
    // these two awaited-in-series calls).
    const isSupervisor = caller.roles.includes('SUPERVISOR');
    if (isSupervisor && !caller.projectId) {
      throw forbidden('Supervisor caller has no project scope.');
    }

    // TEMPORARY — per-call timing, see getRiskProfile's own instrumentation
    // comment. Times each cross-service round trip individually, since they
    // now run concurrently and may have very different durations.
    const start = Date.now();
    const [beneficiary, roster] = await Promise.all([
      this.beneficiaryClient.getById(beneficiaryId, authorizationHeader).then((result) => {
        console.log(
          JSON.stringify({ label: 'beneficiaryClient.getById.timing', ms: Date.now() - start }),
        );
        return result;
      }),
      isSupervisor
        ? listSakhiIdsForSupervisor(
            caller.projectId as string,
            caller.id,
            authorizationHeader,
          ).then((result) => {
            console.log(
              JSON.stringify({
                label: 'listSakhiIdsForSupervisor.timing',
                ms: Date.now() - start,
              }),
            );
            return result;
          })
        : Promise.resolve(null),
    ]);
    if (!beneficiary) throw notFound('Beneficiary not found.');

    if (isSupervisor) {
      if (!roster?.includes(beneficiary.sakhiId)) {
        throw forbidden("This beneficiary is outside this Supervisor's roster.");
      }
    } else if (beneficiary.sakhiId !== caller.id) {
      throw forbidden('You do not have access to this beneficiary.');
    }
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
