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
};

// Real ANC_VISIT question codes (see
// apps/visit-form-service/prisma/seed-data/anc-visit.json), plus `age` and
// `badObstetricHistoryFlag`, which form.service.ts merges in from the
// beneficiary's MOTHER_REGISTRATION submission.
const NORMAL_VITALS = {
  conditionIds: CONDITION_IDS,
  age: 25,
  mid_upper_arm_circumference_in_cm: 24,
  bmi: 22,
  height_of_the_woman_in_cm: 155,
  badObstetricHistoryFlag: false,
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

  it('grades BP 137/86 as Hypertension MILD on the range alone (no history-of-hypertension field exists)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      blood_pressure_bp_systolic: 137,
      blood_pressure_bp_diastolic: 86,
    });

    expect(findCondition(result, CONDITION_IDS.HYPERTENSION).grade).toBe('MILD');
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

  it('grades Fundal Height deviation >2cm as MILD and triggers every instance (pre-computed deviation input)', async () => {
    const result = await evaluateRulePack(ancRiskRulesJson, {
      ...NORMAL_VITALS,
      fundalHeightDeviationCm: 3,
    });

    const fh = findCondition(result, CONDITION_IDS.FUNDAL_HEIGHT);
    expect(fh.grade).toBe('MILD');
    expect(fh.isReferralTrigger).toBe(true);
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
      badObstetricHistoryFlag: true,
      isFirstInstance: { STUNTING: false, AGE: false, BAD_OBSTETRIC_HISTORY: false },
    });

    expect(findCondition(result, CONDITION_IDS.STUNTING).grade).toBe('MILD');
    expect(findCondition(result, CONDITION_IDS.STUNTING).isReferralTrigger).toBe(false);
    expect(findCondition(result, CONDITION_IDS.AGE).isReferralTrigger).toBe(false);
    expect(findCondition(result, CONDITION_IDS.BAD_OBSTETRIC_HISTORY).isReferralTrigger).toBe(
      false,
    );
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

  it('throws when conditionIds is missing an entry the graded vitals require', async () => {
    const incompleteIds: Record<string, string | undefined> = { ...CONDITION_IDS };
    incompleteIds.ANEMIA = undefined;

    await expect(
      evaluateRulePack(ancRiskRulesJson, { ...NORMAL_VITALS, conditionIds: incompleteIds }),
    ).rejects.toThrow();
  });
});
