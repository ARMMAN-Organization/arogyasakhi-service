/**
 * ANC High-Risk clinical grading decision graph (SRS Appendix D — "High risk
 * protocols_Developer's copy - ANC HR", see docs/Appendix_D_High_Risk_Detection_Rules.md, Part 1).
 *
 * Evaluated via the generic `POST /rules/:setId/evaluate` (ruleSet.evaluator.ts,
 * ruleCategory RISK) by risk-referral-service's riskAssessment.service.ts. This
 * pack has no DB access, so anything requiring persisted history is resolved
 * by the caller and passed in as an input:
 *  - `conditionIds`: map of conditionCode -> risk_conditions.risk_condition_id
 *    (UUID), since the output contract (ruleSet.evaluator.ts's
 *    RiskEvaluationResult) requires a real DB id per condition, and this pack
 *    is otherwise portable/environment-agnostic.
 *  - `isFirstInstance`: map of conditionCode -> boolean, for the "only first
 *    instance" conditions (Age, MUAC/BMI, Stunting, Bad Obstetric History,
 *    Gestational Weight Gain, Jaundice) per Appendix D §D.4/§D.5 — computed
 *    by scanning that beneficiary's prior risk_flags history.
 *
 * All other input fields are read directly under their real ANC_VISIT/
 * MOTHER_REGISTRATION question_codes (see
 * apps/visit-form-service/prisma/seed-data/anc-visit.json and
 * mother-registration.json) — the caller passes dto.formData through
 * largely unchanged (plus the registration-derived age/gravida/
 * livingChildren/abortions/priorComplications merge, see form.service.ts's
 * resolveAncRiskRegistrationAnswers), rather than this pack expecting a
 * separately-named/normalized field set. This intentionally couples the
 * pack to the form's current field names; a form schema change to any of
 * the fields read below requires updating this pack in lockstep. The Bad
 * Obstetric History threshold itself (G>4/L<P/abortions>=2/prior
 * complications) is computed inside this pack, not by the caller — business
 * thresholds live in GoRules per .claude/CLAUDE.md.
 *
 * Per Appendix D §D.7, every condition is graded and returned every visit,
 * including NORMAL results — this pack never omits a condition from its
 * output based on its own grade.
 *
 * Known coarser-than-spec gradings, because the form doesn't capture the
 * finer distinction Appendix D describes — tracked pending ARMMAN
 * confirmation as GitHub issue #191:
 *  - Bleeding (APH) has no spotting/moderate/heavy severity field — the
 *    form only captures presence via
 *    "bleeding_from_vagina" inside the shared danger-signs multiselect
 *    (have_you_been_experiencing_any_of_these_since_the_last_visit). Graded
 *    MILD (present) vs NORMAL (absent) only, not by bleeding severity.
 *  - Hypertension's Mild band ("Systolic 135-139/Diastolic 85-89 AND
 *    history of Hypertension or Gestational Hypertension") has no
 *    corresponding "history of hypertension" field on either form — the
 *    history condition is dropped; this band grades MILD on the BP range
 *    alone.
 *  - Hypotension's "or associated with shock features" clause has no
 *    corresponding field — graded on the systolic-BP threshold alone.
 *  - Gestational Weight Gain is captured as the Sakhi's own pre-graded
 *    radio answer ('normal'/'severe' on gestational_weight_gain), not a raw
 *    kg delta — this pack consumes that pre-graded value directly rather
 *    than computing a kg threshold.
 *
 * Postpartum Hemorrhage (PPH) has no referral/HR-visit trigger rule defined
 * in the source sheet (blank cells in §D.4/§D.5) — this pack defaults both
 * trigger flags to `false` for PPH rather than guessing. Issue #191's
 * answer says PPH should be treated under PP-phase danger-sign/bleeding
 * logic, but the PPH risk_conditions row is currently seeded as an ANC
 * condition (anc-risk-conditions.json), not a PP one, and no PP-phase RISK
 * pack exists yet (see pp.rulesJson.ts's own note) — that ANC-vs-PP scoping
 * mismatch needs resolving with ARMMAN before this pack's PPH handling is
 * moved or changed. The ANC_VISIT form also has no dedicated PPH field at
 * all (only the shared bleeding_from_vagina danger sign) — PPH is
 * therefore never actually graded from a real ANC_VISIT submission today;
 * the input exists here for forward-compatibility if a dedicated PPH field
 * is added.
 *
 * Bad Obstetric History (below) grades only G>4/L<P/abortions>=2/prior
 * complications — Appendix D §1.3 also lists Pre-term delivery and LSCS
 * without spacing as BOH criteria, but neither is captured as a discrete
 * form field on MOTHER_REGISTRATION today, so this pack cannot evaluate
 * them; not implemented pending ARMMAN confirming whether new form fields
 * are needed (issue #191).
 *
 * Sickle Cell Disease (SCD) is graded as an INTERIM MEASURE, pending GitHub
 * issue #191 (item 10): Appendix D's Anemia table ties SCD to the Moderate
 * tier, but the app-form spec (Q60) says SCD selected -> Severe risk +
 * referral — these two sources conflict and ARMMAN has not yet confirmed
 * which is correct. This pack currently grades SCD as SEVERE, matching the
 * app-form spec, since that's the more specific source for this exact
 * question and matches the field's own stated risk action. If issue #191
 * is answered as Moderate instead, this grading must be revisited. Sickle
 * Cell Trait (SCT) is deliberately left ungraded — its effect, if any, is
 * also unconfirmed by #191.
 *
 * SCD is graded at the beneficiary's first ANC_VISIT (via
 * sickleCellStatus, merged in from MOTHER_REGISTRATION by
 * resolveAncRiskRegistrationAnswers), not at registration itself —
 * MOTHER_REGISTRATION has no working risk-grading pipeline: its
 * FormDefinition.riskRuleSetId is unset, and registration submissions
 * carry no visitId, which form.service.ts's risk-assessment trigger also
 * requires. Wiring registration-time grading properly would need a new
 * VisitCodeType, a new RuleSet/RuleVersion, and changes to that guard —
 * out of scope for this interim measure. KNOWN GAP: a beneficiary who
 * registers with SCD but never submits a follow-up ANC_VISIT is never
 * graded, and so never gets the referral/HR visit this condition should
 * trigger — accepted as the trade-off for this interim measure, not
 * silently overlooked.
 *
 * Age and Bad Obstetric History are captured once at MOTHER_REGISTRATION,
 * not on the recurring ANC_VISIT form — the caller (riskAssessment.service.ts
 * via form.service.ts) is responsible for fetching and merging those
 * registration-time answers into this pack's input alongside the current
 * visit's own answers.
 *
 * This pack deliberately does NOT read risk_conditions.referralRequiredDefault
 * /educationRequiredDefault — those are reference/display-only master data
 * (see schema.prisma's RiskCondition doc comment); the referral/HR-visit/
 * education trigger logic per condition below (grade-dependent,
 * first-instance-gated, accompanied-by-gated) is this pack's own sole
 * source of truth (see PR #172 review).
 */
export const ancRiskRulesJson = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeAncRiskGrading',
      position: { x: 200, y: 0 },
      content: `
const GRADE_RANK = { NORMAL: 0, MILD: 1, MODERATE: 2, SEVERE: 3 };

const handler = (input, { dayjs }) => {
  const { conditionIds, isFirstInstance } = input;
  if (!conditionIds || typeof conditionIds !== 'object') {
    throw new Error('conditionIds (conditionCode -> risk_condition_id map) is required.');
  }
  const firstInstance = isFirstInstance || {};

  const results = [];

  function requireConditionId(code) {
    const id = conditionIds[code];
    if (!id) throw new Error('conditionIds is missing an entry for ' + code);
    return id;
  }

  // Pushes one graded condition result. onlyFirstInstance conditions get
  // referralTrigger/hrVisitTrigger gated by firstInstance[code]; other
  // conditions use their own trigger rule directly.
  function record(code, grade, observedValueJson, opts) {
    opts = opts || {};
    const gateByFirstInstance = opts.onlyFirstInstance === true;
    const isFirst = firstInstance[code] !== false; // default true if unknown
    const referralEligible = opts.referralTrigger === true;
    const hrEligible = opts.hrVisitTrigger === true;
    results.push({
      riskConditionId: requireConditionId(code),
      grade,
      gradeRank: GRADE_RANK[grade],
      isReferralTrigger: gateByFirstInstance ? referralEligible && isFirst : referralEligible,
      isEducationTrigger: grade !== 'NORMAL',
      isHrVisitTrigger: hrEligible,
      observedValueJson,
    });
  }

  // Danger-signs multiselect shared by several conditions
  // (have_you_been_experiencing_any_of_these_since_the_last_visit) — read
  // once, reused for bleeding presence and the All Danger Signs condition.
  const experiencedSigns = Array.isArray(input.have_you_been_experiencing_any_of_these_since_the_last_visit)
    ? input.have_you_been_experiencing_any_of_these_since_the_last_visit
    : [];

  // --- Age (only first instance; regular HR-visit trigger) ---
  // Merged in by form.service.ts from MOTHER_REGISTRATION's
  // age_of_the_beneficiary — not an ANC_VISIT field.
  const age = input.age;
  if (typeof age === 'number') {
    const ageGrade = age < 19 || age >= 35 ? 'MILD' : 'NORMAL';
    record('AGE', ageGrade, { age }, {
      onlyFirstInstance: true,
      referralTrigger: ageGrade !== 'NORMAL',
      hrVisitTrigger: ageGrade !== 'NORMAL',
    });
  }

  // --- Undernutrition: MUAC/BMI (only first instance) ---
  const muacCm = input.mid_upper_arm_circumference_in_cm;
  const bmi = input.bmi;
  if (typeof muacCm === 'number' || typeof bmi === 'number') {
    const abnormal = (typeof muacCm === 'number' && muacCm < 23) || (typeof bmi === 'number' && (bmi < 18.5 || bmi >= 35));
    const grade = abnormal ? 'MILD' : 'NORMAL';
    record('MUAC_BMI', grade, { muacCm: muacCm ?? null, bmi: bmi ?? null }, {
      onlyFirstInstance: true,
      referralTrigger: grade !== 'NORMAL',
      hrVisitTrigger: grade !== 'NORMAL',
    });
  }

  // --- Undernutrition: Stunting (height, only first instance) ---
  const heightCm = input.height_of_the_woman_in_cm;
  if (typeof heightCm === 'number') {
    const grade = heightCm < 145 ? 'MILD' : 'NORMAL';
    record('STUNTING', grade, { heightCm }, {
      onlyFirstInstance: true,
      referralTrigger: grade !== 'NORMAL',
      hrVisitTrigger: grade !== 'NORMAL',
    });
  }

  // --- Bad Obstetric History (only first instance) ---
  // Raw fields (gravida/livingChildren/abortions/priorComplications) are
  // merged in by form.service.ts from MOTHER_REGISTRATION answers, read
  // unchanged — the G>4/L<P/abortions>=2/prior-complications threshold
  // itself is business-threshold math and belongs here (GoRules), not in
  // TypeScript (see .claude/CLAUDE.md's "business thresholds/rates ... live
  // in GoRules" rule; PR #172 review). Only gravida/livingChildren/abortions
  // and priorComplications need be present for this condition to be graded
  // at all — matches resolveAncRiskRegistrationAnswers's "no registration
  // submission yet" skip, now expressed per-field instead of via one
  // pre-derived flag.
  const gravida = input.gravida;
  const livingChildren = input.livingChildren;
  const abortions = input.abortions;
  const priorComplications = input.priorComplications;
  if (
    typeof gravida === 'number' ||
    typeof abortions === 'number' ||
    Array.isArray(priorComplications)
  ) {
    const badObstetricHistoryFlag =
      (typeof gravida === 'number' && gravida > 4) ||
      (typeof gravida === 'number' &&
        typeof livingChildren === 'number' &&
        livingChildren < gravida) ||
      (typeof abortions === 'number' && abortions >= 2) ||
      (Array.isArray(priorComplications) &&
        priorComplications.some((code) => code !== 'no_complications'));

    const grade = badObstetricHistoryFlag ? 'MILD' : 'NORMAL';
    record('BAD_OBSTETRIC_HISTORY', grade, { badObstetricHistoryFlag }, {
      onlyFirstInstance: true,
      referralTrigger: grade !== 'NORMAL',
      hrVisitTrigger: grade !== 'NORMAL',
    });
  }

  // --- Sickle Cell Disease (only first instance) — INTERIM MEASURE, see
  // this pack's top doc comment. Graded SEVERE per the app-form spec (Q60:
  // "High risk if SCD selected... at severe risk + referral"), NOT
  // Appendix D's Anemia table (which ties SCD to Moderate) — the two
  // sources conflict and the correct tier is unconfirmed pending GitHub
  // issue #191 (item 10). Sickle Cell Trait (SCT) is deliberately left
  // ungraded — its impact, if any, is also unconfirmed by #191.
  // sickleCellStatus is merged in by form.service.ts from
  // MOTHER_REGISTRATION's SCD/SCT question, read at the beneficiary's
  // first ANC_VISIT (not at registration itself — see this pack's doc
  // comment for why registration-time grading isn't wired up).
  const sickleCellStatus = input.sickleCellStatus;
  if (typeof sickleCellStatus === 'string') {
    const grade = sickleCellStatus === 'sickle_cell_disease_scd' ? 'SEVERE' : 'NORMAL';
    record('SICKLE_CELL_DISEASE', grade, { sickleCellStatus }, {
      onlyFirstInstance: true,
      referralTrigger: grade !== 'NORMAL',
      hrVisitTrigger: grade !== 'NORMAL',
    });
  }

  // --- Anemia (every instance of Moderate/Severe) ---
  const hemoglobin = input.haemoglobin_hb_g_dl;
  let anemiaFlagged = false;
  if (typeof hemoglobin === 'number') {
    let grade;
    if (hemoglobin < 7) grade = 'SEVERE';
    else if (hemoglobin < 10) grade = 'MODERATE';
    else if (hemoglobin < 11) grade = 'MILD';
    else grade = 'NORMAL';
    anemiaFlagged = grade === 'MODERATE' || grade === 'SEVERE';
    record('ANEMIA', grade, { hemoglobin }, {
      referralTrigger: anemiaFlagged,
      hrVisitTrigger: anemiaFlagged,
    });
  }

  // --- Blood pressure: classify into Hypertension XOR Hypotension.
  // No "history of hypertension" or "shock features" field exists on
  // either form (see this pack's doc comment) - both grade on the BP
  // threshold alone. ---
  const systolicBp = input.blood_pressure_bp_systolic;
  const diastolicBp = input.blood_pressure_bp_diastolic;
  let hypotensionFlagged = false;
  if (typeof systolicBp === 'number' && typeof diastolicBp === 'number') {
    let htnGrade = 'NORMAL';
    if (systolicBp >= 160 || diastolicBp >= 110) htnGrade = 'SEVERE';
    else if (systolicBp >= 140 || diastolicBp >= 90) htnGrade = 'MODERATE';
    else if ((systolicBp >= 135 && systolicBp <= 139) || (diastolicBp >= 85 && diastolicBp <= 89)) {
      htnGrade = 'MILD';
    }

    const hypoGrade = systolicBp < 90 ? 'MILD' : 'NORMAL';
    hypotensionFlagged = hypoGrade !== 'NORMAL';

    const htnFlagged = htnGrade === 'MODERATE' || htnGrade === 'SEVERE';
    record('HYPERTENSION', htnGrade, { systolicBp, diastolicBp }, {
      referralTrigger: htnFlagged,
      hrVisitTrigger: htnFlagged,
    });
    // Hypotension trigger is resolved after all conditions are known (needs
    // "accompanied by any other flagged condition") — recorded provisionally
    // here, patched below once every other condition has been evaluated.
    record('HYPOTENSION', hypoGrade, { systolicBp }, {
      referralTrigger: false,
      hrVisitTrigger: false,
    });
  }

  // --- Blood sugar: classify into Hyperglycemia / Hypoglycemia ---
  const bloodGlucoseMgDl = input.blood_glucose_in_mg_dl;
  let hypoglycemiaFlagged = false;
  if (typeof bloodGlucoseMgDl === 'number') {
    const hyperGrade = bloodGlucoseMgDl > 140 ? 'MILD' : 'NORMAL';
    record('HYPERGLYCEMIA', hyperGrade, { bloodGlucoseMgDl }, {
      referralTrigger: hyperGrade !== 'NORMAL',
      hrVisitTrigger: hyperGrade !== 'NORMAL',
    });

    const hypoGrade = bloodGlucoseMgDl < 70 ? 'MILD' : 'NORMAL';
    hypoglycemiaFlagged = hypoGrade !== 'NORMAL';
    record('HYPOGLYCEMIA', hypoGrade, { bloodGlucoseMgDl }, {
      referralTrigger: false,
      hrVisitTrigger: false,
    });
  }

  // --- Bleeding: Antepartum Hemorrhage (APH). No severity field exists -
  // graded on presence of "bleeding_from_vagina" within the shared
  // danger-signs multiselect only (see this pack's doc comment). ---
  const aphGrade = experiencedSigns.indexOf('bleeding_from_vagina') !== -1 ? 'MILD' : 'NORMAL';
  record('APH', aphGrade, { bleedingPresent: aphGrade !== 'NORMAL' }, {
    referralTrigger: aphGrade !== 'NORMAL',
    hrVisitTrigger: aphGrade !== 'NORMAL',
  });

  // --- Postpartum Hemorrhage (PPH). No field exists on ANC_VISIT today -
  // this input is accepted for forward-compatibility only (see doc comment
  // on the ANC-vs-PP scoping question still open with ARMMAN); never
  // populated by a real ANC_VISIT submission. ---
  const pphBleedingFlag = input.pphHeavyBleedingFlag;
  if (typeof pphBleedingFlag === 'boolean') {
    const pphGrade = pphBleedingFlag ? 'MILD' : 'NORMAL';
    // Appendix D leaves the PPH referral/HR-visit trigger cells blank — no
    // rule is defined. Default to false (no trigger) rather than guessing;
    // flagged in this pack's own doc comment as a gap pending ARMMAN.
    record('PPH', pphGrade, { pphHeavyBleedingFlag: pphBleedingFlag }, {
      referralTrigger: false,
      hrVisitTrigger: false,
    });
  }

  // --- Body temperature: Hypothermia / Hyperthermia ---
  const bodyTempF = input.body_temperature_in_f;
  let hypothermiaFlagged = false;
  if (typeof bodyTempF === 'number') {
    const hypoGrade = bodyTempF < 96 ? 'MILD' : 'NORMAL';
    hypothermiaFlagged = hypoGrade !== 'NORMAL';
    record('HYPOTHERMIA', hypoGrade, { bodyTempF }, {
      referralTrigger: false,
      hrVisitTrigger: false,
    });

    const hyperGrade = bodyTempF > 99 ? 'MILD' : 'NORMAL';
    record('HYPERTHERMIA', hyperGrade, { bodyTempF }, {
      referralTrigger: hyperGrade !== 'NORMAL',
      hrVisitTrigger: hyperGrade !== 'NORMAL',
    });
  }

  // --- Fetal Heart Rate (every instance). No separate "irregular rhythm"
  // field exists - graded on the bpm range alone. ---
  const fetalHeartRateBpm = input.fetal_heart_rate;
  if (typeof fetalHeartRateBpm === 'number') {
    const grade = fetalHeartRateBpm < 120 || fetalHeartRateBpm > 160 ? 'MILD' : 'NORMAL';
    record('FETAL_HEART_RATE', grade, { fetalHeartRateBpm }, {
      referralTrigger: grade !== 'NORMAL',
      hrVisitTrigger: grade !== 'NORMAL',
    });
  }

  // --- Fundal Height (deviation from gestational-age expectation, every
  // instance). Expected fundal height (cm) == GA in weeks, +/-2cm — no
  // separate GA-to-expected-fundal-height table exists or is needed (issue
  // #191, confirmed). GA is computed here as
  // Floor((visitDate - lmpDate) / 7 days), matching SRS Category 4's own
  // formula exactly (fundal_height_in_cm's own visibleWhen rule shows this
  // field only once GA >= 20 weeks, but this pack grades whatever the form
  // actually submitted rather than re-deriving that visibility gate). Both
  // lmpDate (from resolveAncRiskRegistrationAnswers, MOTHER_REGISTRATION's
  // own lmp_date) and visitDate (this submission's server-assigned
  // submittedAt) must be present — a beneficiary with no registration
  // submission yet simply skips this condition, same as Age/BOH above.
  // visitDate is also required to fall on/after lmpDate: an LMP entered or
  // corrected after this visit was recorded would otherwise produce a
  // negative GA (Math.floor rounds it further negative) and an ungrounded
  // deviation grade — skip rather than grade off a nonsensical GA. ---
  const fundalHeightCm = input.fundal_height_in_cm;
  const lmpDate = input.lmpDate;
  const visitDate = input.visitDate;
  if (
    typeof fundalHeightCm === 'number' &&
    typeof lmpDate === 'string' &&
    typeof visitDate === 'string' &&
    !dayjs(visitDate).isBefore(dayjs(lmpDate))
  ) {
    const gestationalAgeWeeks = dayjs(visitDate).diff(dayjs(lmpDate), 'day') / 7;
    const fundalHeightDeviationCm = fundalHeightCm - Math.floor(gestationalAgeWeeks);
    const grade = Math.abs(fundalHeightDeviationCm) > 2 ? 'MILD' : 'NORMAL';
    record(
      'FUNDAL_HEIGHT',
      grade,
      { fundalHeightCm, gestationalAgeWeeks: Math.floor(gestationalAgeWeeks), fundalHeightDeviationCm },
      {
        referralTrigger: grade !== 'NORMAL',
        hrVisitTrigger: grade !== 'NORMAL',
      },
    );
  }

  // --- Gestational Weight Gain (referral: only first instance; HR visit:
  // every instance). Pre-graded by the Sakhi on the form itself
  // ('normal'/'severe' radio), not a raw kg delta. ---
  const weightGainStatus = input.gestational_weight_gain;
  if (typeof weightGainStatus === 'string') {
    const grade = weightGainStatus === 'severe' ? 'MILD' : 'NORMAL';
    record('GESTATIONAL_WEIGHT_GAIN', grade, { weightGainStatus }, {
      onlyFirstInstance: true,
      referralTrigger: grade !== 'NORMAL',
      hrVisitTrigger: grade !== 'NORMAL',
    });
  }

  // --- Jaundice (2 of 3 signs positive; only first instance) ---
  const jaundiceFields = [input.check_palm_and_nails, input.check_sclera_eyes, input.check_skin];
  const jaundicePositiveCount = jaundiceFields.filter((v) => v === 'yellow').length;
  if (jaundiceFields.some((v) => typeof v === 'string')) {
    const grade = jaundicePositiveCount >= 2 ? 'MILD' : 'NORMAL';
    record('JAUNDICE', grade, { jaundicePositiveCount }, {
      onlyFirstInstance: true,
      referralTrigger: grade !== 'NORMAL',
      hrVisitTrigger: grade !== 'NORMAL',
    });
  }

  // --- Urine Analysis (any abnormal finding, every instance) ---
  const urineTest = input.urine_test;
  if (Array.isArray(urineTest)) {
    const grade = urineTest.some((v) => v !== 'normal') ? 'MILD' : 'NORMAL';
    record('URINE_ANALYSIS', grade, { urineTest }, {
      referralTrigger: grade !== 'NORMAL',
      hrVisitTrigger: grade !== 'NORMAL',
    });
  }

  // --- All Danger Signs (any present, every instance, single condition
  // row). "no_abnormal_signs_and_symptoms" and "bleeding_from_vagina" (its
  // own APH condition above) are excluded from this count. ---
  const dangerSignsExcluding = new Set(['no_abnormal_signs_and_symptoms', 'bleeding_from_vagina']);
  const dangerSignsPresent = experiencedSigns.filter((s) => !dangerSignsExcluding.has(s));
  if (Array.isArray(input.have_you_been_experiencing_any_of_these_since_the_last_visit)) {
    const grade = dangerSignsPresent.length > 0 ? 'MILD' : 'NORMAL';
    record('DANGER_SIGNS', grade, { dangerSigns: dangerSignsPresent }, {
      referralTrigger: grade !== 'NORMAL',
      hrVisitTrigger: grade !== 'NORMAL',
    });
  }

  // --- Resolve "accompanied by any other flagged high-risk condition" gating
  // for Hypotension/Hypoglycemia/Hypothermia (Appendix D §D.4/§D.5), now that
  // every other condition on this visit has been graded. "Any other flagged
  // condition" = any non-NORMAL grade among the *other* results recorded so
  // far, evaluated per gate (excluding the gate's own condition and the
  // sibling gates, since two accompanied-only conditions co-occurring with
  // nothing else are not "accompanied by" each other's un-triggered state).
  const nonNormalCodes = new Set(
    results.filter((r) => r.grade !== 'NORMAL').map((r) => r.riskConditionId),
  );
  const accompaniedGateIds = new Set(
    ['HYPOTENSION', 'HYPOGLYCEMIA', 'HYPOTHERMIA'].map((code) => conditionIds[code]),
  );
  function patchAccompaniedTrigger(code, ownFlagged) {
    if (!ownFlagged) return;
    const entry = results.find((r) => r.riskConditionId === conditionIds[code]);
    if (!entry) return;
    // Excludes both the gate's own condition and the sibling gates
    // (HYPOTENSION/HYPOGLYCEMIA/HYPOTHERMIA) — two accompanied-only
    // conditions co-occurring with nothing else are not "accompanied by"
    // each other's un-triggered state (see this pack's doc comment above).
    const otherNonNormalExists = [...nonNormalCodes].some(
      (id) => id !== entry.riskConditionId && !accompaniedGateIds.has(id),
    );
    entry.isReferralTrigger = otherNonNormalExists;
    entry.isHrVisitTrigger = otherNonNormalExists;
  }
  patchAccompaniedTrigger('HYPOTENSION', hypotensionFlagged);
  patchAccompaniedTrigger('HYPOGLYCEMIA', hypoglycemiaFlagged);
  patchAccompaniedTrigger('HYPOTHERMIA', hypothermiaFlagged);

  // --- Overall visit-level rollup (worst grade across all conditions) ---
  const worstRank = results.reduce((max, r) => Math.max(max, r.gradeRank), 0);
  const overallRiskCategory =
    worstRank === 3 ? 'CRITICAL' : worstRank === 2 ? 'HIGH' : worstRank === 1 ? 'LOW' : 'NORMAL';

  return { overallRiskCategory, conditions: results };
};
      `,
    },
    { id: 'output1', type: 'outputNode', name: 'response', position: { x: 400, y: 0 } },
  ],
  edges: [
    { id: 'e1', sourceId: 'input1', targetId: 'fn1', type: 'edge' },
    { id: 'e2', sourceId: 'fn1', targetId: 'output1', type: 'edge' },
  ],
};
