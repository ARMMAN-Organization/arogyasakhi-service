import { forbidden, notFound, type AuthenticatedUser } from '@armman/service-commons';
import type { BeneficiaryRiskRepository } from './beneficiaryRisk.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';
import { resolveRiskGrades } from './riskGrade.client';
import { resolveEducationContent, type EducationContent } from './educationContent.client';
import { resolveHealthEducationMessages } from './healthEducation.client';

type StateSnapshotRow = Awaited<
  ReturnType<BeneficiaryRiskRepository['findStateSnapshots']>
>[number];

type AssessmentWithFlagsRow = Awaited<
  ReturnType<BeneficiaryRiskRepository['findAssessmentsWithFlags']>
>[number];

/**
 * RiskCondition.conditionCode -> HealthEducationMessage.conditionLabel, for
 * the 5 SRS-specified "as soon as detected" risk-graded conditions
 * (docs/Revised_App_Form_Final_20.3.26.xlsx.md, "Health education message"
 * table, rows 1-5) that ARMMAN's delivered content actually covers. A flag
 * whose conditionCode isn't listed here falls back to the COMING_SOON
 * placeholder, same as before this map existed — this is additive, not a
 * replacement for every condition. Every other condition in that same SRS
 * table (Danger Signs, Neonatal Care, POSTPARTUM Counselling, etc.) is
 * stage-based rather than risk-graded and is served by visit-form-service's
 * health-education stage resolver instead — see that resolver's own doc
 * comment for why those don't belong in this map.
 */
const CONDITION_CODE_TO_LABEL: Record<string, string> = {
  ANEMIA: 'Anemia',
  HYPERTENSION: 'Gestational Hypertension',
  HYPERGLYCEMIA: 'Gestational Diabetes',
  GESTATIONAL_WEIGHT_GAIN: 'Inadequate Gestational weight gain',
  BAD_OBSTETRIC_HISTORY: 'Previous pregnancy complication',
};

/**
 * Every seeded stage string for these 5 conditions contains the word
 * "postpartum" exactly when — and only when — it's the PP-phase message
 * (verified against health-education-messages.json's seed data). This is
 * the only stage-precision riskPhase alone can support: ANC assessments
 * can't be told apart into "as soon as detected" vs "2nd trimester" vs
 * "3rd trimester" sub-stages without a gestational-week calculation (that
 * belongs to the stage resolver, not this risk-flag path) — so an ANC-phase
 * assessment gets every non-postpartum message for the condition, and a
 * PP-phase assessment gets only the postpartum one.
 */
function isPostpartumStage(stage: string): boolean {
  return stage.toLowerCase().includes('postpartum');
}

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
    await this.assertCallerCanViewBeneficiary(beneficiaryId, caller, authorizationHeader);

    const [snapshots, assessments] = await Promise.all([
      this.repository.findStateSnapshots(beneficiaryId),
      this.repository.findAssessmentsWithFlags(beneficiaryId),
    ]);

    const hasTriggeredFlag = assessments.some((a) => a.riskFlags.some((f) => f.isEducationTrigger));
    // Resolved once per call, not once per flag — the COMING_SOON fallback
    // is identical content regardless of which unmapped condition triggered
    // it (mapped conditions get real content below instead).
    const comingSoonContent = hasTriggeredFlag
      ? await resolveEducationContent('COMING_SOON', authorizationHeader)
      : null;

    // Resolved once per distinct (conditionCode, isPostpartum) pair across
    // the whole call, not once per flag/assessment — several assessments
    // commonly re-trigger the same condition (e.g. Anemia flagged at every
    // ANC visit until it resolves), and each pair maps to the same content
    // regardless of which assessment it came from. Caches the in-flight
    // Promise itself, not just its resolved value — toAssessmentView below
    // resolves every flag concurrently via Promise.all, so two flags for the
    // same (conditionCode, phase) pair can both reach this function before
    // either has finished; caching only the settled value would let both
    // still call resolveHealthEducationMessages.
    const contentCache = new Map<string, Promise<EducationContent[]>>();
    function resolveMappedContent(
      conditionCode: string,
      riskPhase: string | null,
    ): Promise<EducationContent[]> {
      const conditionLabel = CONDITION_CODE_TO_LABEL[conditionCode];
      if (!conditionLabel) return Promise.resolve(comingSoonContent ? [comingSoonContent] : []);

      const isPostpartum = riskPhase === 'PP';
      const cacheKey = `${conditionCode}:${isPostpartum}`;
      const cached = contentCache.get(cacheKey);
      if (cached) return cached;

      const pending = (async (): Promise<EducationContent[]> => {
        const messages = await resolveHealthEducationMessages(conditionLabel, authorizationHeader);
        const filtered = riskPhase
          ? messages.filter((m) => isPostpartumStage(m.stage) === isPostpartum)
          : messages; // riskPhase null (pre-migration row) — return every message, undifferentiated.
        const sorted = [...filtered].sort((a, b) => a.messageOrder - b.messageOrder);

        return sorted.length > 0
          ? sorted.map((m) => ({
              topicCode: conditionCode,
              topicName: m.titleEn ?? m.conditionLabel,
              mediaType: m.mediaType,
              contentUrl: m.mediaFile,
            }))
          : comingSoonContent
            ? [comingSoonContent]
            : [];
      })();

      contentCache.set(cacheKey, pending);
      return pending;
    }

    const assessmentViews = await Promise.all(
      assessments.map((assessment) => this.toAssessmentView(assessment, resolveMappedContent)),
    );

    return {
      beneficiaryId,
      currentState: this.toCurrentStatePerPhase(snapshots),
      assessments: assessmentViews,
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
  private async toAssessmentView(
    assessment: AssessmentWithFlagsRow,
    resolveMappedContent: (
      conditionCode: string,
      riskPhase: string | null,
    ) => Promise<EducationContent[]>,
  ) {
    const flags = await Promise.all(
      assessment.riskFlags.map(async (flag) => ({
        id: flag.id,
        conditionCode: flag.riskCondition.conditionCode,
        conditionName: flag.riskCondition.conditionName,
        riskGradeLookupValueId: flag.riskGradeLookupValueId,
        observedValueJson: flag.observedValueJson,
        isReferralTrigger: flag.isReferralTrigger,
        isEducationTrigger: flag.isEducationTrigger,
        isHrVisitTrigger: flag.isHrVisitTrigger,
        educationContent: flag.isEducationTrigger
          ? await resolveMappedContent(flag.riskCondition.conditionCode, assessment.riskPhase)
          : [],
      })),
    );

    return {
      id: assessment.id,
      evaluatedAt: assessment.evaluatedAt,
      overallRiskCategory: assessment.overallRiskCategory,
      overallHighRiskFlag: assessment.overallHighRiskFlag,
      hrDetectedFlag: assessment.hrDetectedFlag,
      flags,
    };
  }
}
