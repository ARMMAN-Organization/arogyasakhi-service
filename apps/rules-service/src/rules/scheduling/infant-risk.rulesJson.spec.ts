import {
  evaluateRulePack,
  type RiskEvaluationResult,
  type RulePackEvaluation,
} from '../ruleSet.evaluator';
import { infantRiskRulesJson } from './infant-risk.rulesJson';

const CONDITION_IDS = {
  LOW_BIRTH_WEIGHT: '22222222-2222-2222-2222-222222222201',
  WASTING: '22222222-2222-2222-2222-222222222202',
  STUNTING_STATUS: '22222222-2222-2222-2222-222222222203',
  UNDERWEIGHT: '22222222-2222-2222-2222-222222222204',
  MUAC_MALNUTRITION: '22222222-2222-2222-2222-222222222205',
  INFANT_HYPOTHERMIA: '22222222-2222-2222-2222-222222222206',
  INFANT_HYPERTHERMIA: '22222222-2222-2222-2222-222222222207',
  CORD_INFECTION: '22222222-2222-2222-2222-222222222208',
  RESPIRATORY_DISTRESS: '22222222-2222-2222-2222-222222222209',
  NEURO_DEVELOPMENTAL_STATUS: '22222222-2222-2222-2222-222222222210',
  INFANT_DANGER_SIGNS: '22222222-2222-2222-2222-222222222211',
  FEEDING_ADEQUACY: '22222222-2222-2222-2222-222222222212',
  ACTIVITY_LEVEL: '22222222-2222-2222-2222-222222222213',
};

// Real INFANT_VISIT/INC_VISIT/CCV_VISIT question codes (see
// apps/visit-form-service/prisma/seed-data/infant-visit.json).
const NORMAL_VITALS_INFANT = {
  conditionIds: CONDITION_IDS,
  birth_weight_in_kg: 3.0,
  nutritional_status_wasting: 'normal',
  nutritional_status_stunting: 'normal',
  nutritional_status_underweight: 'normal',
  muac_in_cms: 13,
  age_in_months: 12,
  child_temprature_in_f: 98,
  child_respiratory_rate_2_12_months: 50,
  is_the_child_showing_all_developmental_milestones_as_per_his_her_age: 'yes',
  is_the_baby_showing_any_danger_signs_since_last_visit: ['no_abnormal_signs_symptoms'],
  feeding_concerns: ['no_concerns'],
  activity_level: 'active_and_moving',
};

// Real NEONATAL_VISIT question codes (see
// apps/visit-form-service/prisma/seed-data/neonatal-visit.json) — no
// temperature/respiratory-rate/MUAC/developmental-milestone fields exist.
const NORMAL_VITALS_NEONATAL = {
  conditionIds: CONDITION_IDS,
  birth_weight_kg: 3.0,
  nutritional_status_wasting: 'normal',
  nutritional_status_stunting: 'normal',
  nutritional_status_underweight: 'normal',
  umbilical_cord_care: 'clean_and_dry',
  danger_signs: ['no_abnormal_signs_symptoms'],
  feeding_concerns: ['no_concerns'],
  activity_level: 'active_and_moving',
};

function findCondition(result: RulePackEvaluation, conditionId: string): RiskEvaluationResult {
  const found = result.conditions.find((c) => c.riskConditionId === conditionId);
  if (!found) throw new Error(`No condition result found for ${conditionId}`);
  return found;
}

describe('infantRiskRulesJson', () => {
  it('grades every vital as NORMAL and returns overallRiskCategory NORMAL when nothing is abnormal (INC_VISIT/CCV_VISIT fields)', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, NORMAL_VITALS_INFANT);

    expect(result.overallRiskCategory).toBe('NORMAL');
    for (const condition of result.conditions) {
      expect(condition.grade).toBe('NORMAL');
      expect(condition.isReferralTrigger).toBe(false);
      expect(condition.isHrVisitTrigger).toBe(false);
    }
  });

  it('grades every vital as NORMAL for a NEONATAL_VISIT payload, evaluating only the fields that form actually has', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, NORMAL_VITALS_NEONATAL);

    expect(result.overallRiskCategory).toBe('NORMAL');
    // Conditions with no corresponding NEONATAL_VISIT field must simply be
    // absent from the output, not errored or defaulted.
    expect(
      result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.INFANT_HYPOTHERMIA),
    ).toBe(false);
    expect(
      result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.RESPIRATORY_DISTRESS),
    ).toBe(false);
    expect(
      result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.MUAC_MALNUTRITION),
    ).toBe(false);
    expect(
      result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.NEURO_DEVELOPMENTAL_STATUS),
    ).toBe(false);
    expect(result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.CORD_INFECTION)).toBe(
      true,
    );
  });

  it('grades Low Birth Weight MILD from birth_weight_in_kg, never triggers referral, but triggers HR visit', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      birth_weight_in_kg: 2.2,
    });

    const lbw = findCondition(result, CONDITION_IDS.LOW_BIRTH_WEIGHT);
    expect(lbw.grade).toBe('MILD');
    expect(lbw.isReferralTrigger).toBe(false);
    expect(lbw.isHrVisitTrigger).toBe(true);
  });

  it('grades Low Birth Weight from birth_weight_kg on a NEONATAL_VISIT payload', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_NEONATAL,
      birth_weight_kg: 2.0,
    });

    expect(findCondition(result, CONDITION_IDS.LOW_BIRTH_WEIGHT).grade).toBe('MILD');
  });

  it('grades wasting mam as MILD and sam as SEVERE from the form-pregraded value', async () => {
    const mam = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      nutritional_status_wasting: 'mam',
    });
    expect(findCondition(mam, CONDITION_IDS.WASTING).grade).toBe('MILD');

    const sam = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      nutritional_status_wasting: 'sam',
    });
    expect(findCondition(sam, CONDITION_IDS.WASTING).grade).toBe('SEVERE');
  });

  it('grades stunting moderately_stunted as MILD and severely_stunted as SEVERE', async () => {
    const moderate = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      nutritional_status_stunting: 'moderately_stunted',
    });
    expect(findCondition(moderate, CONDITION_IDS.STUNTING_STATUS).grade).toBe('MILD');

    const severe = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      nutritional_status_stunting: 'severely_stunted',
    });
    expect(findCondition(severe, CONDITION_IDS.STUNTING_STATUS).grade).toBe('SEVERE');
  });

  it('grades underweight muw as MILD and suw as SEVERE', async () => {
    const muw = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      nutritional_status_underweight: 'muw',
    });
    expect(findCondition(muw, CONDITION_IDS.UNDERWEIGHT).grade).toBe('MILD');

    const suw = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      nutritional_status_underweight: 'suw',
    });
    expect(findCondition(suw, CONDITION_IDS.UNDERWEIGHT).grade).toBe('SEVERE');
  });

  it('triggers nutrition referral on first instance', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      nutritional_status_wasting: 'mam',
      isFirstInstance: { WASTING: true },
    });

    expect(findCondition(result, CONDITION_IDS.WASTING).isReferralTrigger).toBe(true);
  });

  it('does not trigger nutrition referral on a repeat instance with fewer than 3 consecutive no-improvement visits', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      nutritional_status_wasting: 'mam',
      isFirstInstance: { WASTING: false },
      consecutiveNoImprovementCount: { WASTING: 2 },
    });

    expect(findCondition(result, CONDITION_IDS.WASTING).isReferralTrigger).toBe(false);
  });

  it('triggers nutrition referral on a repeat instance with 3+ consecutive no-improvement visits', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      nutritional_status_wasting: 'mam',
      isFirstInstance: { WASTING: false },
      consecutiveNoImprovementCount: { WASTING: 3 },
    });

    expect(findCondition(result, CONDITION_IDS.WASTING).isReferralTrigger).toBe(true);
  });

  it('HR-visit trigger for nutrition conditions fires every instance regardless of first-instance/improvement', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      nutritional_status_wasting: 'mam',
      isFirstInstance: { WASTING: false },
      consecutiveNoImprovementCount: { WASTING: 0 },
    });

    expect(findCondition(result, CONDITION_IDS.WASTING).isHrVisitTrigger).toBe(true);
  });

  it('grades MUAC 12cm (6-24 months) as MILD and 11cm as SEVERE', async () => {
    const mild = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      muac_in_cms: 12,
      age_in_months: 12,
    });
    expect(findCondition(mild, CONDITION_IDS.MUAC_MALNUTRITION).grade).toBe('MILD');

    const severe = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      muac_in_cms: 11,
      age_in_months: 12,
    });
    expect(findCondition(severe, CONDITION_IDS.MUAC_MALNUTRITION).grade).toBe('SEVERE');
  });

  it('does not evaluate MUAC malnutrition for an infant under 6 months', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      muac_in_cms: 10,
      age_in_months: 3,
    });

    expect(
      result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.MUAC_MALNUTRITION),
    ).toBe(false);
  });

  it('grades Hypothermia MILD below 96F and Hyperthermia MILD above 100F (issue #191 confirmed)', async () => {
    const cold = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      child_temprature_in_f: 95,
    });
    const hypo = findCondition(cold, CONDITION_IDS.INFANT_HYPOTHERMIA);
    expect(hypo.grade).toBe('MILD');
    expect(hypo.isReferralTrigger).toBe(true);
    expect(hypo.isHrVisitTrigger).toBe(true);

    const hot = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      child_temprature_in_f: 101,
    });
    const hyper = findCondition(hot, CONDITION_IDS.INFANT_HYPERTHERMIA);
    expect(hyper.grade).toBe('MILD');
    expect(hyper.isReferralTrigger).toBe(true);
    expect(hyper.isHrVisitTrigger).toBe(true);
  });

  it('grades body temperature within 97-99F as NORMAL for both Hypothermia and Hyperthermia', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      child_temprature_in_f: 98,
    });

    expect(findCondition(result, CONDITION_IDS.INFANT_HYPOTHERMIA).grade).toBe('NORMAL');
    expect(findCondition(result, CONDITION_IDS.INFANT_HYPERTHERMIA).grade).toBe('NORMAL');
  });

  it(
    'gates Hypothermia/Hyperthermia HR-visit trigger by first-instance — a neonate hypothermic ' +
      'across two visits fires the 15-day HR follow-up once, not on every visit (PR #172 review)',
    async () => {
      const cold = await evaluateRulePack(infantRiskRulesJson, {
        ...NORMAL_VITALS_INFANT,
        child_temprature_in_f: 95,
        isFirstInstance: { INFANT_HYPOTHERMIA: false, INFANT_HYPERTHERMIA: false },
      });
      const hypo = findCondition(cold, CONDITION_IDS.INFANT_HYPOTHERMIA);
      expect(hypo.grade).toBe('MILD');
      expect(hypo.isReferralTrigger).toBe(true);
      expect(hypo.isHrVisitTrigger).toBe(false);

      const hot = await evaluateRulePack(infantRiskRulesJson, {
        ...NORMAL_VITALS_INFANT,
        child_temprature_in_f: 101,
        isFirstInstance: { INFANT_HYPOTHERMIA: false, INFANT_HYPERTHERMIA: false },
      });
      const hyper = findCondition(hot, CONDITION_IDS.INFANT_HYPERTHERMIA);
      expect(hyper.grade).toBe('MILD');
      expect(hyper.isReferralTrigger).toBe(true);
      expect(hyper.isHrVisitTrigger).toBe(false);
    },
  );

  it('grades Cord infection MILD from umbilical_cord_care, triggers referral every instance', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_NEONATAL,
      umbilical_cord_care: 'redness_discharge_poor_condition',
    });

    const cord = findCondition(result, CONDITION_IDS.CORD_INFECTION);
    expect(cord.grade).toBe('MILD');
    expect(cord.isReferralTrigger).toBe(true);
    expect(cord.isHrVisitTrigger).toBe(true);
  });

  it(
    'gates Cord infection HR-visit trigger by first-instance (issue #191 confirmed single-instance), ' +
      'same treatment as Hypothermia/Hyperthermia',
    async () => {
      const result = await evaluateRulePack(infantRiskRulesJson, {
        ...NORMAL_VITALS_NEONATAL,
        umbilical_cord_care: 'redness_discharge_poor_condition',
        isFirstInstance: { CORD_INFECTION: false },
      });

      const cord = findCondition(result, CONDITION_IDS.CORD_INFECTION);
      expect(cord.grade).toBe('MILD');
      expect(cord.isReferralTrigger).toBe(true);
      expect(cord.isHrVisitTrigger).toBe(false);
    },
  );

  it('grades Respiratory distress MILD for an abnormal rate, triggers referral but not HR visit', async () => {
    const lowRate = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      child_respiratory_rate_2_12_months: 35,
    });
    const lowResult = findCondition(lowRate, CONDITION_IDS.RESPIRATORY_DISTRESS);
    expect(lowResult.grade).toBe('MILD');
    expect(lowResult.isReferralTrigger).toBe(true);
    expect(lowResult.isHrVisitTrigger).toBe(false);
  });

  it('grades Respiratory rate 40-60 as NORMAL', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      child_respiratory_rate_2_12_months: 50,
    });

    expect(findCondition(result, CONDITION_IDS.RESPIRATORY_DISTRESS).grade).toBe('NORMAL');
  });

  it('grades Neuro-developmental status SEVERE when a milestone is missed, triggers both referral and HR visit', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      is_the_child_showing_all_developmental_milestones_as_per_his_her_age: 'no',
    });

    const dev = findCondition(result, CONDITION_IDS.NEURO_DEVELOPMENTAL_STATUS);
    expect(dev.grade).toBe('SEVERE');
    expect(dev.isReferralTrigger).toBe(true);
    expect(dev.isHrVisitTrigger).toBe(true);
  });

  it('grades Neuro-developmental status NORMAL when all milestones are achieved, no triggers', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      is_the_child_showing_all_developmental_milestones_as_per_his_her_age: 'yes',
    });

    const dev = findCondition(result, CONDITION_IDS.NEURO_DEVELOPMENTAL_STATUS);
    expect(dev.grade).toBe('NORMAL');
    expect(dev.isReferralTrigger).toBe(false);
    expect(dev.isHrVisitTrigger).toBe(false);
  });

  it('grades Activity Level NORMAL for active_and_moving', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      activity_level: 'active_and_moving',
    });

    const activity = findCondition(result, CONDITION_IDS.ACTIVITY_LEVEL);
    expect(activity.grade).toBe('NORMAL');
    expect(activity.isReferralTrigger).toBe(false);
  });

  it('grades Activity Level MILD for reduced_movement, no referral (assessment finding only)', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      activity_level: 'reduced_movement',
    });

    const activity = findCondition(result, CONDITION_IDS.ACTIVITY_LEVEL);
    expect(activity.grade).toBe('MILD');
    expect(activity.isReferralTrigger).toBe(false);
  });

  it('grades Activity Level SEVERE for lethargic, triggers referral', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      activity_level: 'lethargic',
    });

    const activity = findCondition(result, CONDITION_IDS.ACTIVITY_LEVEL);
    expect(activity.grade).toBe('SEVERE');
    expect(activity.isReferralTrigger).toBe(true);
  });

  it('grades any Danger Sign present (INFANT_VISIT field) as a single MILD condition row, triggering both referral and HR visit', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      is_the_baby_showing_any_danger_signs_since_last_visit: [
        'convulsions_twitching_fits_or_abnormal_movements',
        'lethargy_floppiness_or_inability_to_wake_up',
      ],
    });

    const dangerRows = result.conditions.filter(
      (c) => c.riskConditionId === CONDITION_IDS.INFANT_DANGER_SIGNS,
    );
    expect(dangerRows).toHaveLength(1);
    expect(dangerRows[0].grade).toBe('MILD');
    expect(dangerRows[0].isReferralTrigger).toBe(true);
    expect(dangerRows[0].isHrVisitTrigger).toBe(true);
  });

  it('gates Danger Signs HR-visit trigger by first-instance (PR #172 review)', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      is_the_baby_showing_any_danger_signs_since_last_visit: [
        'convulsions_twitching_fits_or_abnormal_movements',
      ],
      isFirstInstance: { INFANT_DANGER_SIGNS: false },
    });

    const danger = findCondition(result, CONDITION_IDS.INFANT_DANGER_SIGNS);
    expect(danger.grade).toBe('MILD');
    expect(danger.isReferralTrigger).toBe(true);
    expect(danger.isHrVisitTrigger).toBe(false);
  });

  it('grades any Danger Sign present (NEONATAL_VISIT field) as MILD', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_NEONATAL,
      danger_signs: ['convulsions'],
    });

    expect(findCondition(result, CONDITION_IDS.INFANT_DANGER_SIGNS).grade).toBe('MILD');
  });

  it('grades Feeding adequacy MILD and triggers referral for any feeding_concerns value other than no_concerns', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      feeding_concerns: ['baby_refusing_to_feed'],
    });

    const feeding = findCondition(result, CONDITION_IDS.FEEDING_ADEQUACY);
    expect(feeding.grade).toBe('MILD');
    expect(feeding.isReferralTrigger).toBe(true);
    expect(feeding.isHrVisitTrigger).toBe(false);
  });

  it('grades Feeding adequacy NORMAL when feeding_concerns is exactly no_concerns', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      feeding_concerns: ['no_concerns'],
    });

    expect(findCondition(result, CONDITION_IDS.FEEDING_ADEQUACY).grade).toBe('NORMAL');
  });

  it('is not graded when feeding_concerns is absent (field not on this form/visit)', async () => {
    const vitalsWithoutFeedingConcerns: Record<string, unknown> = { ...NORMAL_VITALS_INFANT };
    delete vitalsWithoutFeedingConcerns.feeding_concerns;

    const result = await evaluateRulePack(infantRiskRulesJson, vitalsWithoutFeedingConcerns);

    expect(
      result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.FEEDING_ADEQUACY),
    ).toBe(false);
  });

  it('rolls up overallRiskCategory to CRITICAL when any condition is SEVERE', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      nutritional_status_wasting: 'sam',
    });
    expect(result.overallRiskCategory).toBe('CRITICAL');
  });

  it('rolls up overallRiskCategory to LOW when the worst grade is MILD (no Moderate band exists for infant conditions)', async () => {
    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      birth_weight_in_kg: 2.0,
    });
    expect(result.overallRiskCategory).toBe('LOW');
  });

  it('skips only the affected condition when conditionIds is missing an entry a graded input requires, grading everything else normally', async () => {
    const incompleteIds: Record<string, string | undefined> = { ...CONDITION_IDS };
    incompleteIds.WASTING = undefined;

    const result = await evaluateRulePack(infantRiskRulesJson, {
      ...NORMAL_VITALS_INFANT,
      conditionIds: incompleteIds,
    });

    expect(result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.WASTING)).toBe(false);
    expect(
      result.conditions.some((c) => c.riskConditionId === CONDITION_IDS.LOW_BIRTH_WEIGHT),
    ).toBe(true);
    expect(result.conditions.length).toBeGreaterThan(0);
  });
});
