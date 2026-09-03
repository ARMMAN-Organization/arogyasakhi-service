import {
  evaluateRulePack,
  type RiskEvaluationResult,
  type RulePackEvaluation,
} from '../ruleSet.evaluator';
import { ancRiskRulesJson } from './anc-risk.rulesJson';

const CONDITION_IDS = {
  AGE: '11111111-1111-1111-1111-111111111101',
  MUAC_BMI: '11111111-1111-1111-1111-111111111102',
  STUNTING: '11111111-1111-1111-1111-111111111103',
  BAD_OBSTETRIC_HISTORY: '11111111-1111-1111-1111-111111111104',
  ANEMIA: '11111111-1111-1111-1111-111111111105',
  HYPERTENSION: '11111111-1111-1111-1111-111111111106',
  HYPOTENSION: '11111111-1111-1111-1111-111111111107',
  HYPERGLYCEMIA: '11111111-1111-1111-1111-111111111108',
  HYPOGLYCEMIA: '11111111-1111-1111-1111-111111111109',
  APH: '11111111-1111-1111-1111-111111111110',
  PPH: '11111111-1111-1111-1111-111111111111',
  HYPOTHERMIA: '11111111-1111-1111-1111-111111111112',
  HYPERTHERMIA: '11111111-1111-1111-1111-111111111113',
  FETAL_HEART_RATE: '11111111-1111-1111-1111-111111111114',
  FUNDAL_HEIGHT: '11111111-1111-1111-1111-111111111115',
  GESTATIONAL_WEIGHT_GAIN: '11111111-1111-1111-1111-111111111116',
  JAUNDICE: '11111111-1111-1111-1111-111111111117',
  URINE_ANALYSIS: '11111111-1111-1111-1111-111111111118',
  DANGER_SIGNS: '11111111-1111-1111-1111-111111111119',
  SICKLE_CELL_DISEASE: '11111111-1111-1111-1111-111111111120',
};

// Real ANC_VISIT question codes (see
// apps/visit-form-service/prisma/seed-data/anc-visit.json), plus `age` and
// the raw gravida/livingChildren/abortions/priorComplications fields, which
// form.service.ts merges in from the beneficiary's MOTHER_REGISTRATION
// submission — the Bad Obstetric History threshold (G>4/L<P/abortions>=2/
// prior complications) is computed inside this rule pack, not by the
// caller (see PR #172 review: business thresholds live in GoRules).
const NORMAL_VITALS = {
  conditionIds: CONDITION_IDS,
  age: 25,
  mid_upper_arm_circumference_in_cm: 24,
  bmi: 22,
  height_of_the_woman_in_cm: 155,
  gravida: 2,
  livingChildren: 2,
  abortions: 0,
  priorComplications: ['no_complications'],
  haemoglobin_hb_g_dl: 12,
  blood_pressure_bp_systolic: 110,
  blood_pressure_bp_diastolic: 70,
  blood_glucose_in_mg_dl: 100,
  have_you_been_experiencing_any_of_these_since_the_last_visit: ['no_abnormal_signs_and_symptoms'],
  body_temperature_in_f: 98,
  fetal_heart_rate: 140,
  gestational_weight_gain: 'normal',
  check_palm_and_nails: 'normal',
  check_sclera_eyes: 'normal',
  check_skin: 'normal',
  urine_test: ['normal'],
};

function findCondition(result: RulePackEvaluation, conditionId: string): RiskEvaluationResult {
  const found = result.conditions.find((c) => c.riskConditionId === conditionId);
  if (!found) throw new Error(`No condition result found for ${conditionId}`);
  return found;
}

describe('ancRiskRulesJson', () => {
  it('grades every vital as NORMAL and returns overallRiskCategory NORMAL when nothing is abnormal', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, NORMAL_VITALS);

    expect(result.overallRiskCategory).toBe('NORMAL');
    for (const condition of result.conditions) {
      expect(condition.grade).toBe('NORMAL');
      expect(condition.isReferralTrigger).toBe(false);
      expect(condition.isHrVisitTrigger).toBe(false);
      expect(condition.isEducationTrigger).toBe(false);
    }
  });

  it('grades Moderate anemia and triggers referral + HR visit (every instance of Moderate/Severe)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      haemoglobin_hb_g_dl: 9.5,
    });

    const anemia = findCondition(result, CONDITION_IDS.ANEMIA);
    expect(anemia.grade).toBe('MODERATE');
    expect(anemia.isReferralTrigger).toBe(true);
    expect(anemia.isHrVisitTrigger).toBe(true);
    expect(anemia.isEducationTrigger).toBe(true);
  });

  it('grades Mild anemia as counselling-only — no referral, no HR visit', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      haemoglobin_hb_g_dl: 10.5,
    });

    const anemia = findCondition(result, CONDITION_IDS.ANEMIA);
    expect(anemia.grade).toBe('MILD');
    expect(anemia.isReferralTrigger).toBe(false);
    expect(anemia.isHrVisitTrigger).toBe(false);
  });

  it('grades Severe anemia and triggers referral + HR visit', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      haemoglobin_hb_g_dl: 6.5,
    });

    const anemia = findCondition(result, CONDITION_IDS.ANEMIA);
    expect(anemia.grade).toBe('SEVERE');
    expect(anemia.isReferralTrigger).toBe(true);
    expect(anemia.isHrVisitTrigger).toBe(true);
  });

  it('classifies BP 145/95 as Hypertension MODERATE, not Hypotension', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_pressure_bp_systolic: 145,
      blood_pressure_bp_diastolic: 95,
    });

    const htn = findCondition(result, CONDITION_IDS.HYPERTENSION);
    const hypo = findCondition(result, CONDITION_IDS.HYPOTENSION);
    expect(htn.grade).toBe('MODERATE');
    expect(htn.isReferralTrigger).toBe(true);
    expect(hypo.grade).toBe('NORMAL');
  });

  it('grades BP 137/86 as NORMAL (not MILD) when historyOfHypertension is absent — Mild requires BOTH the BP range AND history', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_pressure_bp_systolic: 137,
      blood_pressure_bp_diastolic: 86,
    });

    expect(findCondition(result, CONDITION_IDS.HYPERTENSION).grade).toBe('NORMAL');
  });

  it('grades BP 137/86 as Hypertension MILD when historyOfHypertension is true', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_pressure_bp_systolic: 137,
      blood_pressure_bp_diastolic: 86,
      historyOfHypertension: true,
    });

    const htn = findCondition(result, CONDITION_IDS.HYPERTENSION);
    expect(htn.grade).toBe('MILD');
    expect(htn.isReferralTrigger).toBe(false);
    expect(htn.isHrVisitTrigger).toBe(false);
  });

  it('grades BP 137/86 as Hypertension MILD when gestationalHypertension is true (history OR gestational)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_pressure_bp_systolic: 137,
      blood_pressure_bp_diastolic: 86,
      gestationalHypertension: true,
    });

    expect(findCondition(result, CONDITION_IDS.HYPERTENSION).grade).toBe('MILD');
  });

  it('Moderate/Severe Hypertension bands are unaffected by historyOfHypertension (BP threshold alone still governs)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_pressure_bp_systolic: 145,
      blood_pressure_bp_diastolic: 95,
      historyOfHypertension: false,
    });

    expect(findCondition(result, CONDITION_IDS.HYPERTENSION).grade).toBe('MODERATE');
  });

  it('grades Hypotension MILD but does not trigger referral/HR visit when it is the only flagged condition', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_pressure_bp_systolic: 85,
    });

    const hypo = findCondition(result, CONDITION_IDS.HYPOTENSION);
    expect(hypo.grade).toBe('MILD');
    expect(hypo.isReferralTrigger).toBe(false);
    expect(hypo.isHrVisitTrigger).toBe(false);
  });

  it('triggers Hypotension referral/HR visit when accompanied by another flagged condition (Anemia Moderate)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_pressure_bp_systolic: 85,
      haemoglobin_hb_g_dl: 9.5,
    });

    const hypo = findCondition(result, CONDITION_IDS.HYPOTENSION);
    expect(hypo.grade).toBe('MILD');
    expect(hypo.isReferralTrigger).toBe(true);
    expect(hypo.isHrVisitTrigger).toBe(true);
  });

  describe('Hypotension shock features (issue #191 item 2)', () => {
    it('grades MILD via shock features (dizziness) even when systolicBp is in the normal range', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        blood_pressure_bp_systolic: 110,
        have_you_been_experiencing_any_of_these_since_the_last_visit: ['dizziness'],
      });

      expect(findCondition(result, CONDITION_IDS.HYPOTENSION).grade).toBe('MILD');
    });

    it('grades MILD via shock features (breathlessness) even when systolicBp is in the normal range', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        blood_pressure_bp_systolic: 110,
        have_you_been_experiencing_any_of_these_since_the_last_visit: ['breathlessness'],
      });

      expect(findCondition(result, CONDITION_IDS.HYPOTENSION).grade).toBe('MILD');
    });

    it('grades MILD via shock features (palpitation) even when systolicBp is in the normal range', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        blood_pressure_bp_systolic: 110,
        have_you_been_experiencing_any_of_these_since_the_last_visit: ['palpitation'],
      });

      expect(findCondition(result, CONDITION_IDS.HYPOTENSION).grade).toBe('MILD');
    });

    it('does not grade MILD for a danger sign that is not a shock feature (e.g. severe_abdominal_pain), with normal BP', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        blood_pressure_bp_systolic: 110,
        have_you_been_experiencing_any_of_these_since_the_last_visit: ['severe_abdominal_pain'],
      });

      expect(findCondition(result, CONDITION_IDS.HYPOTENSION).grade).toBe('NORMAL');
    });

    it('still grades MILD on the BP threshold alone, with no shock features present', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        blood_pressure_bp_systolic: 85,
      });

      expect(findCondition(result, CONDITION_IDS.HYPOTENSION).grade).toBe('MILD');
    });

    it('grades MILD when BOTH the BP threshold and a shock feature are present (not double-counted)', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        blood_pressure_bp_systolic: 85,
        have_you_been_experiencing_any_of_these_since_the_last_visit: ['dizziness'],
      });

      expect(findCondition(result, CONDITION_IDS.HYPOTENSION).grade).toBe('MILD');
    });
  });

  it('grades Hyperglycemia MILD and triggers every instance', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_glucose_in_mg_dl: 145,
    });

    const hyper = findCondition(result, CONDITION_IDS.HYPERGLYCEMIA);
    expect(hyper.grade).toBe('MILD');
    expect(hyper.isReferralTrigger).toBe(true);
    expect(hyper.isHrVisitTrigger).toBe(true);
  });

  it('grades Hypoglycemia MILD without triggering when alone', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_glucose_in_mg_dl: 65,
    });

    const hypo = findCondition(result, CONDITION_IDS.HYPOGLYCEMIA);
    expect(hypo.grade).toBe('MILD');
    expect(hypo.isReferralTrigger).toBe(false);
    expect(hypo.isHrVisitTrigger).toBe(false);
  });

  it('does not trigger Hypotension/Hypoglycemia off each other when only the two co-occur — sibling accompanied-by gates are excluded (PR #172 review)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_pressure_bp_systolic: 85,
      blood_glucose_in_mg_dl: 60,
    });

    const hypotension = findCondition(result, CONDITION_IDS.HYPOTENSION);
    const hypoglycemia = findCondition(result, CONDITION_IDS.HYPOGLYCEMIA);
    expect(hypotension.grade).toBe('MILD');
    expect(hypoglycemia.grade).toBe('MILD');
    expect(hypotension.isReferralTrigger).toBe(false);
    expect(hypotension.isHrVisitTrigger).toBe(false);
    expect(hypoglycemia.isReferralTrigger).toBe(false);
    expect(hypoglycemia.isHrVisitTrigger).toBe(false);
  });

  it('grades Hyperthermia MILD and triggers every instance; Hypothermia MILD alone does not trigger', async () => {
    const hyper = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      body_temperature_in_f: 100,
    });
    const hyperthermia = findCondition(hyper, CONDITION_IDS.HYPERTHERMIA);
    expect(hyperthermia.grade).toBe('MILD');
    expect(hyperthermia.isReferralTrigger).toBe(true);

    const hypo = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      body_temperature_in_f: 95,
    });
    const hypothermia = findCondition(hypo, CONDITION_IDS.HYPOTHERMIA);
    expect(hypothermia.grade).toBe('MILD');
    expect(hypothermia.isReferralTrigger).toBe(false);
  });

  it('grades abnormal Fetal Heart Rate MILD and triggers every instance, both below and above range', async () => {
    const low = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      fetal_heart_rate: 110,
    });
    expect(findCondition(low, CONDITION_IDS.FETAL_HEART_RATE).grade).toBe('MILD');
    expect(findCondition(low, CONDITION_IDS.FETAL_HEART_RATE).isReferralTrigger).toBe(true);

    const high = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      fetal_heart_rate: 165,
    });
    expect(findCondition(high, CONDITION_IDS.FETAL_HEART_RATE).grade).toBe('MILD');

    const normal = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      fetal_heart_rate: 140,
    });
    expect(findCondition(normal, CONDITION_IDS.FETAL_HEART_RATE).grade).toBe('NORMAL');
  });

  it('grades Fundal Height deviation >2cm as MILD, computed from GA (issue #191 confirmed formula)', async () => {
    // GA at visitDate = Floor((2026-08-01 - 2026-01-01) / 7) = 30 weeks.
    // fundal_height_in_cm 33 - GA 30 = 3cm deviation, > 2cm -> MILD.
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      fundal_height_in_cm: 33,
      lmpDate: '2026-01-01',
      visitDate: '2026-08-01',
    });

    const fh = findCondition(result, CONDITION_IDS.FUNDAL_HEIGHT);
    expect(fh.grade).toBe('MILD');
    expect(fh.isReferralTrigger).toBe(true);
    expect(fh.isHrVisitTrigger).toBe(true);
  });

  it('grades Fundal Height within 2cm of GA as NORMAL', async () => {
    // GA at visitDate = 30 weeks; fundal_height_in_cm 31 - GA 30 = 1cm, <= 2cm -> NORMAL.
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      fundal_height_in_cm: 31,
      lmpDate: '2026-01-01',
      visitDate: '2026-08-01',
    });

    const fh = findCondition(result, CONDITION_IDS.FUNDAL_HEIGHT);
    expect(fh.grade).toBe('NORMAL');
    expect(fh.isReferralTrigger).toBe(false);
  });

  it('skips Fundal Height when lmpDate is missing (no MOTHER_REGISTRATION submission yet)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      fundal_height_in_cm: 33,
      visitDate: '2026-08-01',
    });

    expect(result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.FUNDAL_HEIGHT)).toBe(
      false,
    );
  });

  it('skips Fundal Height when visitDate is before lmpDate (data-entry error / late LMP correction)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      fundal_height_in_cm: 33,
      lmpDate: '2026-08-01',
      visitDate: '2026-01-01',
    });

    expect(result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.FUNDAL_HEIGHT)).toBe(
      false,
    );
  });

  it('gates MUAC/BMI referral trigger by first-instance but always records the grade', async () => {
    const first = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      mid_upper_arm_circumference_in_cm: 21,
      bmi: 17,
      isFirstInstance: { MUAC_BMI: true },
    });
    const firstResult = findCondition(first, CONDITION_IDS.MUAC_BMI);
    expect(firstResult.grade).toBe('MILD');
    expect(firstResult.isReferralTrigger).toBe(true);

    const repeat = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      mid_upper_arm_circumference_in_cm: 21,
      bmi: 17,
      isFirstInstance: { MUAC_BMI: false },
    });
    const repeatResult = findCondition(repeat, CONDITION_IDS.MUAC_BMI);
    expect(repeatResult.grade).toBe('MILD');
    expect(repeatResult.isReferralTrigger).toBe(false);
  });

  it('grades obese BMI (>=35) as MILD under the combined MUAC/BMI condition', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      mid_upper_arm_circumference_in_cm: 24,
      bmi: 36,
      isFirstInstance: { MUAC_BMI: true },
    });

    expect(findCondition(result, CONDITION_IDS.MUAC_BMI).grade).toBe('MILD');
  });

  it('gates Stunting, Age, and Bad Obstetric History referral triggers by first-instance', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      height_of_the_woman_in_cm: 140,
      age: 40,
      gravida: 5,
      isFirstInstance: { STUNTING: false, AGE: false, BAD_OBSTETRIC_HISTORY: false },
    });

    expect(findCondition(result, CONDITION_IDS.STUNTING).grade).toBe('MILD');
    expect(findCondition(result, CONDITION_IDS.STUNTING).isReferralTrigger).toBe(false);
    expect(findCondition(result, CONDITION_IDS.AGE).isReferralTrigger).toBe(false);
    expect(findCondition(result, CONDITION_IDS.BAD_OBSTETRIC_HISTORY).isReferralTrigger).toBe(
      false,
    );
  });

  describe('Bad Obstetric History threshold (moved into GoRules — PR #172 review)', () => {
    it('grades NORMAL when none of the threshold conditions are met', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, NORMAL_VITALS);
      expect(findCondition(result, CONDITION_IDS.BAD_OBSTETRIC_HISTORY).grade).toBe('NORMAL');
    });

    it('grades MILD when gravida exceeds 4', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, { ...NORMAL_VITALS, gravida: 5 });
      expect(findCondition(result, CONDITION_IDS.BAD_OBSTETRIC_HISTORY).grade).toBe('MILD');
    });

    it('grades MILD when livingChildren is less than gravida', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        gravida: 3,
        livingChildren: 1,
      });
      expect(findCondition(result, CONDITION_IDS.BAD_OBSTETRIC_HISTORY).grade).toBe('MILD');
    });

    it('grades MILD when abortions >= 2', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, { ...NORMAL_VITALS, abortions: 2 });
      expect(findCondition(result, CONDITION_IDS.BAD_OBSTETRIC_HISTORY).grade).toBe('MILD');
    });

    it('grades MILD when a non-"no_complications" answer is present', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        priorComplications: ['yes_miscarriage'],
      });
      expect(findCondition(result, CONDITION_IDS.BAD_OBSTETRIC_HISTORY).grade).toBe('MILD');
    });

    it('is not graded at all when no registration-derived field is present', async () => {
      const rest = { ...NORMAL_VITALS };
      delete (rest as Partial<typeof NORMAL_VITALS>).gravida;
      delete (rest as Partial<typeof NORMAL_VITALS>).livingChildren;
      delete (rest as Partial<typeof NORMAL_VITALS>).abortions;
      delete (rest as Partial<typeof NORMAL_VITALS>).priorComplications;

      const result = await evaluateRulePack(ancRiskRulesJson, rest);
      expect(
        result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.BAD_OBSTETRIC_HISTORY),
      ).toBe(false);
    });
  });

  it('Gestational Weight Gain: referral gated by first-instance, HR visit trigger fires every instance (pre-graded radio value)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      gestational_weight_gain: 'severe',
      isFirstInstance: { GESTATIONAL_WEIGHT_GAIN: false },
    });

    const gwg = findCondition(result, CONDITION_IDS.GESTATIONAL_WEIGHT_GAIN);
    expect(gwg.grade).toBe('MILD');
    expect(gwg.isReferralTrigger).toBe(false);
    expect(gwg.isHrVisitTrigger).toBe(true);
  });

  it('grades Jaundice MILD only when >=2 of 3 signs are positive (check_palm_and_nails/sclera/skin), gated by first-instance', async () => {
    const oneSign = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      check_palm_and_nails: 'yellow',
    });
    expect(findCondition(oneSign, CONDITION_IDS.JAUNDICE).grade).toBe('NORMAL');

    const twoSignsFirst = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      check_palm_and_nails: 'yellow',
      check_sclera_eyes: 'yellow',
      isFirstInstance: { JAUNDICE: true },
    });
    expect(findCondition(twoSignsFirst, CONDITION_IDS.JAUNDICE).grade).toBe('MILD');
    expect(findCondition(twoSignsFirst, CONDITION_IDS.JAUNDICE).isReferralTrigger).toBe(true);

    const twoSignsRepeat = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      check_palm_and_nails: 'yellow',
      check_sclera_eyes: 'yellow',
      isFirstInstance: { JAUNDICE: false },
    });
    expect(findCondition(twoSignsRepeat, CONDITION_IDS.JAUNDICE).isReferralTrigger).toBe(false);
  });

  it('grades abnormal Urine Analysis MILD and triggers every instance (no first-instance gate)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      urine_test: ['protein'],
    });

    const urine = findCondition(result, CONDITION_IDS.URINE_ANALYSIS);
    expect(urine.grade).toBe('MILD');
    expect(urine.isReferralTrigger).toBe(true);
  });

  it('grades any Danger Sign present (excluding bleeding, which is its own APH condition) as a single MILD condition row triggering every instance', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      have_you_been_experiencing_any_of_these_since_the_last_visit: [
        'severe_abdominal_pain',
        'convulsions',
      ],
    });

    const dangerSignRows = result.conditions.filter(
      (c) => c.riskConditionId === CONDITION_IDS.DANGER_SIGNS,
    );
    expect(dangerSignRows).toHaveLength(1);
    expect(dangerSignRows[0].grade).toBe('MILD');
    expect(dangerSignRows[0].isReferralTrigger).toBe(true);
  });

  it('does not count bleeding_from_vagina toward the Danger Signs condition — it grades APH instead', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      have_you_been_experiencing_any_of_these_since_the_last_visit: ['bleeding_from_vagina'],
    });

    expect(findCondition(result, CONDITION_IDS.DANGER_SIGNS).grade).toBe('NORMAL');
    expect(findCondition(result, CONDITION_IDS.APH).grade).toBe('MILD');
  });

  it('grades Antepartum Hemorrhage MILD when bleeding_from_vagina is present in the shared danger-signs multiselect', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      have_you_been_experiencing_any_of_these_since_the_last_visit: ['bleeding_from_vagina'],
    });

    const aph = findCondition(result, CONDITION_IDS.APH);
    expect(aph.grade).toBe('MILD');
    expect(aph.isReferralTrigger).toBe(true);
  });

  it('grades Postpartum Hemorrhage MILD but never triggers referral/HR visit (undefined in Appendix D, no real form field)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      pphHeavyBleedingFlag: true,
    });

    const pph = findCondition(result, CONDITION_IDS.PPH);
    expect(pph.grade).toBe('MILD');
    expect(pph.isReferralTrigger).toBe(false);
    expect(pph.isHrVisitTrigger).toBe(false);
  });

  it('rolls up overallRiskCategory to the worst grade present: CRITICAL when any condition is SEVERE', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      haemoglobin_hb_g_dl: 6.5,
    });
    expect(result.overallRiskCategory).toBe('CRITICAL');
  });

  it('rolls up overallRiskCategory to HIGH when the worst grade is MODERATE', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      haemoglobin_hb_g_dl: 9.5,
    });
    expect(result.overallRiskCategory).toBe('HIGH');
  });

  it('rolls up overallRiskCategory to LOW when the worst grade is MILD', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_glucose_in_mg_dl: 145,
    });
    expect(result.overallRiskCategory).toBe('LOW');
  });

  it('reports multiple simultaneous HR conditions independently and rolls up to the worst', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      haemoglobin_hb_g_dl: 6.5,
      blood_pressure_bp_systolic: 145,
      blood_pressure_bp_diastolic: 95,
      have_you_been_experiencing_any_of_these_since_the_last_visit: ['convulsions'],
    });

    expect(findCondition(result, CONDITION_IDS.ANEMIA).grade).toBe('SEVERE');
    expect(findCondition(result, CONDITION_IDS.HYPERTENSION).grade).toBe('MODERATE');
    expect(findCondition(result, CONDITION_IDS.DANGER_SIGNS).grade).toBe('MILD');
    expect(result.overallRiskCategory).toBe('CRITICAL');
  });

  it('throws when conditionIds is missing', async () => {
    const rest: Record<string, unknown> = { ...NORMAL_VITALS };
    delete rest.conditionIds;
    await expect(evaluateRulePack(ancRiskRulesJson, rest)).rejects.toThrow();
  });

  it('skips only the affected condition when conditionIds is missing an entry the graded vitals require, grading everything else normally', async () => {
    const incompleteIds: Record<string, string | undefined> = { ...CONDITION_IDS };
    incompleteIds.ANEMIA = undefined;

    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      conditionIds: incompleteIds,
    });

    expect(result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.ANEMIA)).toBe(false);
    expect(result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.AGE)).toBe(true);
    expect(result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.HYPERTENSION)).toBe(
      true,
    );
    expect(result.conditions.length).toBeGreaterThan(0);
  });

  it('skips Sickle Cell Disease gracefully (does not abort the rest of grading) when its conditionId mapping is missing — the realistic already-seeded-environment scenario', async () => {
    const idsWithoutScd: Record<string, string | undefined> = { ...CONDITION_IDS };
    idsWithoutScd.SICKLE_CELL_DISEASE = undefined;

    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      conditionIds: idsWithoutScd,
      sickleCellStatus: 'sickle_cell_disease_scd',
    });

    expect(
      result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.SICKLE_CELL_DISEASE),
    ).toBe(false);
    expect(result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.ANEMIA)).toBe(true);
    expect(result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.HYPERTENSION)).toBe(
      true,
    );
  });

  describe('Sickle Cell Disease (interim measure pending issue #191 tier confirmation)', () => {
    it('grades SEVERE with referral and HR-visit triggers when SCD is selected, on first instance', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        sickleCellStatus: 'sickle_cell_disease_scd',
        isFirstInstance: { SICKLE_CELL_DISEASE: true },
      });

      const condition = findCondition(result, CONDITION_IDS.SICKLE_CELL_DISEASE);
      expect(condition.grade).toBe('SEVERE');
      expect(condition.isReferralTrigger).toBe(true);
      expect(condition.isHrVisitTrigger).toBe(true);
    });

    it('grades NORMAL when sickleCellStatus is absent or a non-SCD answer', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        sickleCellStatus: 'tested_and_result_is_normal',
      });

      const condition = findCondition(result, CONDITION_IDS.SICKLE_CELL_DISEASE);
      expect(condition.grade).toBe('NORMAL');
      expect(condition.isReferralTrigger).toBe(false);
      expect(condition.isHrVisitTrigger).toBe(false);
    });

    it('grades SEVERE and suppresses only the referral trigger on a repeat (non-first) instance — HR-visit trigger fires every instance, matching Age/MUAC/Stunting/BOH', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        sickleCellStatus: 'sickle_cell_disease_scd',
        isFirstInstance: { SICKLE_CELL_DISEASE: false },
      });

      const condition = findCondition(result, CONDITION_IDS.SICKLE_CELL_DISEASE);
      expect(condition.grade).toBe('SEVERE');
      expect(condition.isReferralTrigger).toBe(false);
      expect(condition.isHrVisitTrigger).toBe(true);
    });

    it('defaults to first-instance (triggers fire) when isFirstInstance omits this condition', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        sickleCellStatus: 'sickle_cell_disease_scd',
      });

      const condition = findCondition(result, CONDITION_IDS.SICKLE_CELL_DISEASE);
      expect(condition.isReferralTrigger).toBe(true);
      expect(condition.isHrVisitTrigger).toBe(true);
    });

    it('grades NORMAL for Sickle Cell Trait (SCT) — grading impact unconfirmed, not implemented (issue #191)', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        sickleCellStatus: 'sickle_cell_trait_sct_carrier',
      });

      expect(findCondition(result, CONDITION_IDS.SICKLE_CELL_DISEASE).grade).toBe('NORMAL');
    });

    it('is omitted entirely when sickleCellStatus is not present, matching Bad Obstetric History\'s "no registration data yet" behavior', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, NORMAL_VITALS);

      expect(
        result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.SICKLE_CELL_DISEASE),
      ).toBe(false);
    });

    it('is present (graded NORMAL) per §D.7 whenever sickleCellStatus is supplied, even with a non-SCD answer', async () => {
      const result = await evaluateRulePack(ancRiskRulesJson, {
        ...NORMAL_VITALS,
        sickleCellStatus: 'tested_and_result_is_normal',
      });

      expect(
        result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.SICKLE_CELL_DISEASE),
      ).toBe(true);
    });
  });
});
