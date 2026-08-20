import type { VisitInstanceRepository } from '../visits/visitInstance.repository';
import { listRiskAssessments } from '../risk-assessments/riskAssessment.client';
import { evaluateSchedule } from '../rules/scheduleEvaluate.client';
import { setCcvOpeningRiskState } from '../beneficiaries/update-phase.client';
import { appConfig } from '../config/app-config';

/**
 * Maps ccv.rulesJson.ts's own 5-value riskState output to
 * beneficiary-service's CcvOpeningRiskState DB enum — the two are NOT
 * string-identical (NEVER_AT_HR vs NEVER_HR, CURRENTLY_HR_SAM vs
 * CURRENTLY_HR_SAM_DANGER), see beneficiary-service/prisma/schema.prisma's
 * CcvOpeningRiskState enum comment and ccv.rulesJson.ts's own docstring.
 */
const RULE_PACK_RISK_STATE_TO_DB_ENUM: Record<string, string> = {
  NEVER_AT_HR: 'NEVER_HR',
  CURRENTLY_HR_SAM: 'CURRENTLY_HR_SAM_DANGER',
  CURRENTLY_HR_OTHER: 'CURRENTLY_HR_OTHER',
  RECENTLY_RECOVERED: 'RECENTLY_RECOVERED',
  STABLE_LOW_RISK: 'STABLE_LOW_RISK',
};

const LAST_N_INC_VISITS = 3;

/**
 * BR-13: "risk state is evaluated exactly once, at the 12-month INC-to-CCV
 * transition, from the last 3 completed INC visits" (see
 * ccv.rulesJson.ts's own docstring for the full rule).
 *
 * Runs immediately after form.service.ts's CHILD phase-advance lands a case
 * at CCV (INC->CCV — see FORM_CODE_TO_CHILD_PHASE). Resolves the last 3
 * completed INC visits (owned by this service), scans the full 0-12m window
 * for "was HR ever detected" (also owned by this service), fetches each
 * visit's RiskAssessment from risk-referral-service (which owns that data
 * but not visit typing — no cross-service join per the forklift rule, hence
 * the id-handoff), evaluates the seeded CCV schedule pack via rules-service,
 * maps its output enum to the DB enum, and writes the result to
 * beneficiary-service.
 *
 * Best-effort end-to-end, same tolerance as every other call in
 * form.service.ts's createSubmission: a failure/skip at any step here never
 * throws — it just means ccvOpeningRiskState stays null for this
 * beneficiary a bit longer, not that the CCV visit submission itself fails.
 * Skipped entirely (not attempted) when CCV_SCHEDULE_RULE_SET_ID is unset —
 * see app-config.ts's own comment on why that's optional.
 */
export async function resolveAndWriteCcvOpeningRiskState(
  beneficiaryId: string,
  dob: string,
  visitInstanceRepository: VisitInstanceRepository,
  authorizationHeader: string,
): Promise<void> {
  if (!appConfig.CCV_SCHEDULE_RULE_SET_ID) return;

  try {
    const [recentIncVisits, allInfantVisitIds] = await Promise.all([
      visitInstanceRepository.findRecentCompletedIncVisits(beneficiaryId, LAST_N_INC_VISITS),
      visitInstanceRepository.findAllCompletedInfantVisitIds(beneficiaryId),
    ]);
    if (recentIncVisits.length === 0) return;

    const allInfantAssessments = await listRiskAssessments(
      beneficiaryId,
      allInfantVisitIds,
      authorizationHeader,
    );
    if (allInfantAssessments === null) return;

    const hrEverDetectedIn0to12m = allInfantAssessments.some((a) => a.hrDetectedFlag);

    const recentIncVisitIds = recentIncVisits.map((v) => v.id);
    const recentAssessmentsByVisitId = new Map(
      allInfantAssessments
        .filter((a) => a.visitId && recentIncVisitIds.includes(a.visitId))
        .map((a) => [a.visitId as string, a]),
    );
    const last3IncVisitsNormal = recentIncVisits.every(
      (v) => !(recentAssessmentsByVisitId.get(v.id)?.hrDetectedFlag ?? false),
    );

    // Most recent INC visit is recentIncVisits[0] (findRecentCompletedIncVisits
    // orders most-recent-first).
    //
    // APPROXIMATION, not a confirmed rule: ccv.rulesJson.ts's
    // mostRecentIncVisitHrType wants specifically "SAM/danger sign at most
    // recent INC visit" vs "other HR condition" — but RiskAssessment (this
    // service's only visibility into that visit's grading) has no flag
    // distinguishing SAM/danger-signs from any other condition that was
    // graded SEVERE; overallRiskCategory === 'CRITICAL' means "some
    // condition hit gradeRank 3" (infant-risk.rulesJson.ts's worst-rank
    // rollup), which SAM/danger-signs are members of but not the only
    // members (e.g. severe wasting alone also produces CRITICAL). Treating
    // CRITICAL as SAM_DANGER here will misclassify a non-SAM SEVERE case as
    // SAM_DANGER instead of OTHER — same cadence either way per
    // ccv.rulesJson.ts (both map to a 1-month cadence), so this doesn't
    // affect the visit schedule it produces, but it IS a real gap against
    // BR-13's literal wording. Flagged, not silently assumed correct — a
    // precise fix needs risk-referral-service to expose which specific
    // conditions were flagged per assessment, not just the rollup category.
    const mostRecentAssessment = recentAssessmentsByVisitId.get(recentIncVisits[0].id);
    const mostRecentIncVisitHrType = !mostRecentAssessment?.hrDetectedFlag
      ? 'NONE'
      : mostRecentAssessment.overallRiskCategory === 'CRITICAL'
        ? 'SAM_DANGER'
        : 'OTHER';

    const evaluation = await evaluateSchedule(
      appConfig.CCV_SCHEDULE_RULE_SET_ID,
      'CCV',
      {
        dob,
        hrEverDetectedIn0to12m,
        mostRecentIncVisitHrType,
        last3IncVisitsNormal,
        // BR-13's own program-exit extension logic (evaluated at DOB+730) is
        // out of scope here — this call only needs the opening riskState,
        // computed once at the INC->CCV transition, so this input is always
        // false at this call site.
        hrDetectedAtLastCcvVisit: false,
      },
      authorizationHeader,
    );
    if (!evaluation || typeof evaluation.riskState !== 'string') return;

    const dbEnumValue = RULE_PACK_RISK_STATE_TO_DB_ENUM[evaluation.riskState];
    if (!dbEnumValue) {
      console.warn(
        `CCV schedule pack returned unmapped riskState "${evaluation.riskState}" for ` +
          `beneficiary ${beneficiaryId} — skipping ccvOpeningRiskState write.`,
      );
      return;
    }

    await setCcvOpeningRiskState(beneficiaryId, dbEnumValue, authorizationHeader);
  } catch (err) {
    console.warn(
      `Failed to resolve ccvOpeningRiskState (BR-13) for beneficiary ${beneficiaryId}. ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
