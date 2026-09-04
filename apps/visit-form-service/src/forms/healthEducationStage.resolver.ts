import { diffInDays } from '@armman/core';
import { resolveHealthEducationMessagesByStage } from './healthEducation.client';

/**
 * Weeks pregnant at `visitDate`, per SRS Category 4's own
 * Floor((visitDate - lmpDate) / 7) formula — same calculation
 * anc-risk.rulesJson.ts's Fundal Height GA-deviation check already uses
 * server-side, duplicated here (not imported — that formula lives in
 * rules-service, a separate deployable) rather than left unimplemented.
 * Returns undefined when the date strings are unparseable or visitDate
 * precedes lmpDate (same guard rules-service's own version applies) — GA-
 * gated content is then simply omitted, never a hard error.
 */
export function gestationalWeeksAt(lmpDate: string, visitDate: string): number | undefined {
  const lmp = new Date(lmpDate);
  const visit = new Date(visitDate);
  if (Number.isNaN(lmp.getTime()) || Number.isNaN(visit.getTime())) return undefined;
  const days = diffInDays(lmp, visit);
  if (days < 0) return undefined;
  return Math.floor(days / 7);
}

/**
 * Whole months between `birthDate` and `visitDate` — used for INC's
 * age-in-months gating (Infant Care: Complementary Feeding, 6th-10th
 * month). Calendar-month arithmetic (not day/30), same convention as
 * `age_of_the_beneficiary`-style fields elsewhere in this codebase that
 * report age in whole years/months rather than an approximation.
 */
export function ageInMonthsAt(birthDate: string, visitDate: string): number | undefined {
  const birth = new Date(birthDate);
  const visit = new Date(visitDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(visit.getTime())) return undefined;
  if (visit < birth) return undefined;
  let months =
    (visit.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    (visit.getUTCMonth() - birth.getUTCMonth());
  if (visit.getUTCDate() < birth.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export interface StageEducationContent {
  topicCode: string;
  topicName: string;
  mediaType: string;
  contentUrl: string | null;
}

/**
 * The 16 SRS-specified health-education conditions
 * (docs/Revised_App_Form_Final_20.3.26.xlsx.md, "Health education message"
 * table) that are stage-based rather than risk-graded: they display
 * unconditionally (or gated by trimester/visit-sequence/delivery-outcome)
 * on the relevant visit type, not because a RiskFlag.isEducationTrigger
 * fired. This is a genuinely different mechanism from
 * risk-referral-service's beneficiaryRisk.service.ts's
 * CONDITION_CODE_TO_LABEL map (the 5 "as soon as detected" risk-graded
 * conditions) — see that file's own doc comment for why those don't belong
 * here. `stage` values below are matched verbatim against cms-content-
 * service's seeded HealthEducationMessage.stage column (health-education-
 * messages.json) — changing either side without the other silently breaks
 * this mapping (no referential integrity across services, per the
 * forklift rule).
 */
const UNCONDITIONAL_STAGES_BY_FORM: Partial<Record<string, readonly string[]>> = {
  // Shown on every ANC visit regardless of gestational age.
  ANC_VISIT: ['Show this for all the ANC visits'],
  // Shown on every PP visit (PP1 through PP5), both POSTPARTUM Counselling
  // messages together — no PP-sequence differentiation in the seed data.
  POSTPARTUM_VISIT: ['All PP visits'],
  // Shown on both NN1 and NN2 — one seeded stage string covers both.
  NEONATAL_VISIT: ['NN1 and NN2'],
  // Shown on every INC visit — Danger Signs, Immunization, and Malnutrition
  // in Infants are all unconditional across the INC series; Complementary
  // Feeding is additionally age-gated (see AGE_GATED_STAGES below).
  INC_VISIT: ['All INC visit', 'All INC visits'],
};

/**
 * Gestational-week-gated (ANC) and infant-age-in-months-gated (INC) content.
 * Each entry's `stage` is matched verbatim against the seed data; `minWeek`/
 * `maxWeek` (ANC, inclusive) or `minMonth`/`maxMonth` (INC, inclusive) bound
 * when it applies. Week/month boundaries are this resolver's own judgment
 * call, converting the SRS table's mixed month/trimester phrasing into a
 * single comparable unit — same kind of call risk-referral-service's
 * commit d73eb52a already made for the 5 risk-graded conditions, documented
 * here per condition since the SRS source doesn't give exact week cutoffs.
 */
interface GaGatedStage {
  formCode: string;
  stage: string;
  minWeek?: number;
  maxWeek?: number;
  minMonth?: number;
  maxMonth?: number;
  /** Only fire once, on the beneficiary's first-ever submission of this
   * formCode — Primigravida is framed in the SRS as a one-time orientation
   * message, not something to repeat every visit. */
  firstVisitOnly?: boolean;
}

const GA_GATED_STAGES: readonly GaGatedStage[] = [
  // Primigravida — 1st/2nd trimester (4th month), first ANC visit only.
  {
    formCode: 'ANC_VISIT',
    stage: '1st/2nd trimester (4th month)',
    minWeek: 13,
    maxWeek: 20,
    firstVisitOnly: true,
  },
  // Birth preparedness — 2nd trimester (6th-7th month).
  {
    formCode: 'ANC_VISIT',
    stage: '2nd Trimester (6th month and 7th month)',
    minWeek: 21,
    maxWeek: 30,
  },
  // Substance Use During Pregnancy — 2nd trimester (4th-6th month).
  {
    formCode: 'ANC_VISIT',
    stage: '2nd Trimester (4th month and 6th month)',
    minWeek: 13,
    maxWeek: 26,
  },
  // Micronutrient Supplementation — 2nd trimester (4th-5th month).
  {
    formCode: 'ANC_VISIT',
    stage: '2nd Trimester (4th month and 5th month)',
    minWeek: 13,
    maxWeek: 22,
  },
  // Nutrition during Pregnancy — 2nd trimester (5th month).
  { formCode: 'ANC_VISIT', stage: '2nd Trimester (5th month)', minWeek: 17, maxWeek: 22 },
  // Family Planning and Spacing — 3rd trimester (8th month).
  { formCode: 'ANC_VISIT', stage: '3rd Trimester (8th month)', minWeek: 31, maxWeek: 35 },
  // Breastfeeding — 3rd trimester (8th-9th month).
  {
    formCode: 'ANC_VISIT',
    stage: '3rd Trimester (8th month and 9th month)',
    minWeek: 31,
    maxWeek: 40,
  },
  // Dehydration — all visits of 2nd and 3rd trimester.
  { formCode: 'ANC_VISIT', stage: 'All visits of 2nd and 3rd trimester', minWeek: 13, maxWeek: 40 },
  // Infant Care: Complementary Feeding — INC visits between 6th and 10th month of age.
  {
    formCode: 'INC_VISIT',
    stage: 'All INC visits between 6th and 10th month',
    minMonth: 6,
    maxMonth: 10,
  },
];

/** Closure-reason codes (ANC_CLOSURE_VISIT's `closure_reason`) that indicate pregnancy loss. */
const LOSS_CLOSURE_REASONS = new Set(['miscarriage', 'abortion_spontaneous_induced_mtp']);

/** DELIVERY_VISIT childN_delivery_outcome values that indicate a stillbirth. */
const STILLBIRTH_OUTCOMES = new Set([
  'antepartum_still_birth_fresh',
  'intrapartum_still_birth_macerated',
]);

const POST_LOSS_STAGE =
  "If the delivery outcome is 'Still birth' or 'Miscarriage' and 'Abortion' in Closure form";

function toEducationContent(m: {
  titleEn: string | null;
  conditionLabel: string;
  mediaType: string;
  mediaFile: string | null;
}): StageEducationContent {
  return {
    topicCode: m.conditionLabel,
    topicName: m.titleEn ?? m.conditionLabel,
    mediaType: m.mediaType,
    contentUrl: m.mediaFile,
  };
}

async function resolveStages(
  stages: readonly string[],
  authorizationHeader: string,
): Promise<StageEducationContent[]> {
  const results = await Promise.all(
    stages.map((stage) => resolveHealthEducationMessagesByStage(stage, authorizationHeader)),
  );
  return results
    .flat()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.messageOrder - b.messageOrder)
    .map(toEducationContent);
}

/**
 * Resolves the SRS's 16 stage-based health-education conditions applicable
 * to one form submission — independent of risk grading, per this feature's
 * implementation plan (see the module doc comment above). Never throws:
 * every input (GA weeks, age, closure reason) is treated as
 * "gate doesn't apply" when absent or unparseable, matching this service's
 * existing best-effort tolerance for non-critical post-submission content
 * (e.g. triggerRiskAssessment's own stance).
 */
export async function resolveStageEducationContent(
  input: {
    formCode: string;
    /** Weeks pregnant at this visit — Floor((visitDate - LMP) / 7), same
     * formula as anc-risk.rulesJson.ts's Fundal Height GA-deviation calc.
     * Undefined when LMP is unknown (no MOTHER_REGISTRATION submission, or
     * lmp_date unanswered) — GA-gated ANC content is then simply omitted. */
    gestationalWeeks?: number;
    /** Infant's age in whole months at this visit (INC only). */
    ageInMonths?: number;
    /** True only for the beneficiary's first-ever submission of formCode
     * (used for Primigravida's first-visit-only gate). */
    isFirstVisitOfFormCode?: boolean;
    /** ANC_CLOSURE_VISIT's own `closure_reason` answer, when present. */
    closureReasonCode?: string;
    /** True when this DELIVERY_VISIT submission recorded a stillbirth on
     * any child slot (child1/2/3_delivery_outcome). */
    hasStillbirthOutcome?: boolean;
  },
  authorizationHeader: string,
): Promise<StageEducationContent[]> {
  const stagesToResolve = new Set<string>();

  for (const stage of UNCONDITIONAL_STAGES_BY_FORM[input.formCode] ?? []) {
    stagesToResolve.add(stage);
  }

  for (const gated of GA_GATED_STAGES) {
    if (gated.formCode !== input.formCode) continue;
    if (gated.firstVisitOnly && !input.isFirstVisitOfFormCode) continue;

    if (gated.minWeek !== undefined || gated.maxWeek !== undefined) {
      if (input.gestationalWeeks === undefined) continue;
      if (gated.minWeek !== undefined && input.gestationalWeeks < gated.minWeek) continue;
      if (gated.maxWeek !== undefined && input.gestationalWeeks > gated.maxWeek) continue;
    }

    if (gated.minMonth !== undefined || gated.maxMonth !== undefined) {
      if (input.ageInMonths === undefined) continue;
      if (gated.minMonth !== undefined && input.ageInMonths < gated.minMonth) continue;
      if (gated.maxMonth !== undefined && input.ageInMonths > gated.maxMonth) continue;
    }

    stagesToResolve.add(gated.stage);
  }

  const isLossOutcome =
    (input.closureReasonCode !== undefined && LOSS_CLOSURE_REASONS.has(input.closureReasonCode)) ||
    input.hasStillbirthOutcome === true;
  if (isLossOutcome) stagesToResolve.add(POST_LOSS_STAGE);

  if (stagesToResolve.size === 0) return [];
  return resolveStages([...stagesToResolve], authorizationHeader);
}

/** True when any of the given delivery-outcome answers is a stillbirth. */
export function hasStillbirthOutcome(deliveryOutcomes: readonly unknown[]): boolean {
  return deliveryOutcomes.some(
    (outcome) => typeof outcome === 'string' && STILLBIRTH_OUTCOMES.has(outcome),
  );
}
