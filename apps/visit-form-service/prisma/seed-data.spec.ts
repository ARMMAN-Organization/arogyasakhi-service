import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  schemaJsonSchema,
  validationJsonSchema,
  type FormField,
} from '../src/forms/dto/form-field.dto';

interface SeedPayload {
  schemaJson: FormField[];
  validationJson: unknown[];
}

function loadSeedData(fileName: string): SeedPayload {
  const raw = readFileSync(join(__dirname, 'seed-data', fileName), 'utf8');
  return JSON.parse(raw) as SeedPayload;
}

const motherRegistration = loadSeedData('mother-registration.json');
const childRegistration = loadSeedData('child-registration.json');
const ancVisit = loadSeedData('anc-visit.json');
const infantVisit = loadSeedData('infant-visit.json');
const deliveryVisit = loadSeedData('delivery-visit.json');
const postpartumVisit = loadSeedData('postpartum-visit.json');
const neonatalVisit = loadSeedData('neonatal-visit.json');

/**
 * Every seed-data file must round-trip through the same Zod schemas the
 * admin form-authoring API (PATCH .../versions/:id) validates against — a
 * seed file with a typo or malformed field would otherwise only surface
 * when someone runs the seed script against a real database.
 */
describe.each([
  ['mother-registration.json', motherRegistration],
  ['child-registration.json', childRegistration],
  ['anc-visit.json', ancVisit],
  ['infant-visit.json', infantVisit],
  ['delivery-visit.json', deliveryVisit],
  ['postpartum-visit.json', postpartumVisit],
  ['neonatal-visit.json', neonatalVisit],
])('%s', (_name, payload) => {
  it('has a schemaJson that satisfies schemaJsonSchema', () => {
    expect(() => schemaJsonSchema.parse(payload.schemaJson)).not.toThrow();
  });

  it('has a validationJson that satisfies validationJsonSchema', () => {
    expect(() => validationJsonSchema.parse(payload.validationJson)).not.toThrow();
  });

  it('has unique question_codes', () => {
    const codes = payload.schemaJson.map((f) => f.question_code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('mother-registration.json', () => {
  const byCode = new Map(motherRegistration.schemaJson.map((f) => [f.question_code, f]));

  it('applies the LMP date rule (Registration_PW_D Q5)', () => {
    expect(byCode.get('lmp_date')?.dateRule).toEqual({
      notFuture: true,
      notAfter: { field: 'registration_date' },
      minDaysFrom: { field: 'registration_date', days: 30 },
      maxDaysFrom: { field: 'registration_date', days: 240 },
    });
  });

  it('applies the ANC-1 date rule (Registration_PW_D Q42)', () => {
    expect(byCode.get('if_anc1_completed_please_record_the_date')?.dateRule).toEqual({
      notBefore: { field: 'lmp_date' },
      notAfter: { field: 'registration_date', offsetDays: 5 },
    });
  });

  it('applies Td dose date ordering rules (Registration_PW_D Q44)', () => {
    expect(byCode.get('td_1_date')?.dateRule).toEqual({ notFuture: true });
    expect(byCode.get('td_2_date')?.dateRule).toEqual({
      notFuture: true,
      notBefore: { field: 'td_1_date' },
    });
    expect(byCode.get('td_booster_date')?.dateRule).toEqual({
      notFuture: true,
      notBefore: { field: 'td_2_date' },
    });
  });

  it('applies NAME_NO_SPECIAL_CHARS to beneficiary_name (Registration_PW_D Q19)', () => {
    expect(byCode.get('beneficiary_name')?.pattern).toBe('NAME_NO_SPECIAL_CHARS');
  });

  it('has exactly 3 EXCLUSIVE_OPTION rules for the "none/no known condition" checkbox groups', () => {
    const exclusiveRules = motherRegistration.validationJson.filter(
      (r) => (r as { rule: string }).rule === 'EXCLUSIVE_OPTION',
    );
    expect(exclusiveRules).toHaveLength(3);
  });

  it('has a REQUIRED_IF_SELECTED rule so each selected Td dose requires its date', () => {
    expect(motherRegistration.validationJson).toContainEqual({
      rule: 'REQUIRED_IF_SELECTED',
      field: 'has_the_women_received_td_dose',
      optionFieldMap: {
        td_1_date: 'td_1_date',
        td_2_date: 'td_2_date',
        td_booster_date: 'td_booster_date',
      },
    });
  });

  it('has 9 total validationJson rules (5 existing + 3 EXCLUSIVE_OPTION + 1 REQUIRED_IF_SELECTED)', () => {
    expect(motherRegistration.validationJson).toHaveLength(9);
  });
});

describe('child-registration.json', () => {
  const byCode = new Map(childRegistration.schemaJson.map((f) => [f.question_code, f]));

  it('has exactly 55 fields (51 existing + 4 new per-vaccine date fields)', () => {
    expect(childRegistration.schemaJson).toHaveLength(55);
  });

  it('applies the DOB-of-infant date rule (Infant Registration form Q6)', () => {
    expect(byCode.get('date_of_birth_of_infant')?.dateRule).toEqual({
      notFuture: true,
      maxDaysFrom: { field: 'registrtion_date', days: 183 },
    });
  });

  it('applies NAME_NO_SPECIAL_CHARS to the caregiver name (Q19)', () => {
    expect(byCode.get('caregiver_name_first_name_middle_name_last_name')?.pattern).toBe(
      'NAME_NO_SPECIAL_CHARS',
    );
  });

  it('applies exactLength 10 to mobile_number (Q22)', () => {
    expect(byCode.get('mobile_number')?.exactLength).toBe(10);
  });

  it('only requires mother_beneficiary_id when registering a child of a registered pregnant woman', () => {
    expect(byCode.get('mother_beneficiary_id')?.visibleWhen).toEqual({
      field: 'who_are_you_registering_in_the_program',
      operator: 'eq',
      value: 'child_of_a_registered_pregnant_woman',
    });
  });

  it('adds a visibleWhen-gated date field per vaccine (Q49)', () => {
    const vaccineCodes = ['bcg_date', 'opv_date', 'hepatitis_b_date', 'vitamin_k_date'];
    for (const code of vaccineCodes) {
      expect(byCode.get(code)?.visibleWhen).toEqual({
        field: 'vaccination_taken_at_birth',
        operator: 'contains',
        value: code,
      });
      expect(byCode.get(code)?.input_type).toBe('date');
      expect(byCode.get(code)?.required).toBe(false);
    }
  });

  it('has an EXCLUSIVE_OPTION rule so "None" cannot combine with a selected vaccine (Q49)', () => {
    expect(childRegistration.validationJson).toContainEqual({
      rule: 'EXCLUSIVE_OPTION',
      field: 'vaccination_taken_at_birth',
      exclusiveValues: ['none'],
    });
  });

  it('has a REQUIRED_IF_SELECTED rule so each selected vaccine requires its date', () => {
    expect(childRegistration.validationJson).toContainEqual({
      rule: 'REQUIRED_IF_SELECTED',
      field: 'vaccination_taken_at_birth',
      optionFieldMap: {
        bcg_date: 'bcg_date',
        opv_date: 'opv_date',
        hepatitis_b_date: 'hepatitis_b_date',
        vitamin_k_date: 'vitamin_k_date',
      },
    });
  });

  it('has 3 total validationJson rules (1 ANY_OF_REQUIRED + 1 EXCLUSIVE_OPTION + 1 REQUIRED_IF_SELECTED)', () => {
    expect(childRegistration.validationJson).toHaveLength(3);
  });
});

describe('anc-visit.json', () => {
  const fields = ancVisit.schemaJson;
  const byCode = new Map(fields.map((f) => [f.question_code, f]));

  it('has exactly 56 fields, per the Revised App Form Final ANC visit form', () => {
    expect(fields).toHaveLength(56);
  });

  it('groups fields into Tests, Symptoms, History, in that order', () => {
    const sections = fields.map((f) => f.section);
    const firstSymptoms = sections.indexOf('Symptoms');
    const firstHistory = sections.indexOf('History');

    expect(sections.slice(0, firstSymptoms).every((s) => s === 'Tests')).toBe(true);
    expect(sections.slice(firstSymptoms, firstHistory).every((s) => s === 'Symptoms')).toBe(true);
    expect(sections.slice(firstHistory).every((s) => s === 'History')).toBe(true);
    expect(sections.filter((s) => s === 'Tests')).toHaveLength(11);
    expect(sections.filter((s) => s === 'Symptoms')).toHaveLength(28);
    expect(sections.filter((s) => s === 'History')).toHaveLength(17);
  });

  it('wires computed fields to the correct computedFrom formula', () => {
    expect(byCode.get('edd')?.computedFrom).toBe('EDD_FROM_LMP');
    expect(byCode.get('current_gestational_age_in_weeks')?.computedFrom).toBe(
      'GESTATIONAL_AGE_AT_VISIT',
    );
    expect(byCode.get('bmi')?.computedFrom).toBe('BMI');
    expect(byCode.get('gestational_weight_gain')?.computedFrom).toBe('GESTATIONAL_WEIGHT_GAIN');
  });

  it('applies numericRange to every field the source doc bounds', () => {
    const expectedRanges: Record<string, { min: number; max: number }> = {
      height_of_the_woman_in_cm: { min: 120, max: 190 },
      current_weight_of_the_woman_in_kg: { min: 25, max: 100 },
      mid_upper_arm_circumference_in_cm: { min: 10, max: 40 },
      blood_pressure_bp_systolic: { min: 70, max: 300 },
      blood_pressure_bp_diastolic: { min: 40, max: 130 },
      body_temperature_in_f: { min: 94, max: 105 },
      haemoglobin_hb_g_dl: { min: 1, max: 18 },
      blood_glucose_in_mg_dl: { min: 40, max: 400 },
      fundal_height_in_cm: { min: 10, max: 50 },
      how_many_ifa_tablets_did_you_consume_since_last_visit: { min: 0, max: 35 },
    };

    for (const [code, range] of Object.entries(expectedRanges)) {
      expect(byCode.get(code)?.numericRange).toEqual(range);
    }
  });

  // visibleWhen is a single {field,operator,value} object only — never an
  // array of ANDed conditions. The mobile client's FormVisibilityEvaluator
  // does not parse an array shape and crashes the whole form load if it sees
  // one (2026-08-07 incident: ANC_VISIT became unopenable for every Sakhi).
  // A field that would otherwise need two conditions (its own condition AND
  // "met beneficiary = yes") keeps only the met-beneficiary gate — the more
  // recently confirmed, higher-impact fix — until mobile ships array support
  // and the two-condition form can be restored.
  const MET_BENEFICIARY_YES = {
    field: 'have_you_been_able_to_meet_the_beneficiary_for_the_visit',
    operator: 'eq',
    value: 'yes',
  };

  it('never stores visibleWhen as an array — mobile only parses a single condition object', () => {
    for (const field of fields) {
      if (field.visibleWhen !== undefined) {
        expect(Array.isArray(field.visibleWhen)).toBe(false);
      }
    }
  });

  it('shows the not-met reason only when the beneficiary was not met', () => {
    // The only Q5+ field NOT gated behind met=yes — it's the met=no branch itself.
    expect(byCode.get('if_no_mention_reasons')?.visibleWhen).toEqual({
      field: 'have_you_been_able_to_meet_the_beneficiary_for_the_visit',
      operator: 'eq',
      value: 'no',
    });
  });

  it('gates every Q5+ field behind met-beneficiary=yes', () => {
    // fetal_movements/fetal_heart_rate/fundal_height_in_cm are excluded here:
    // per the source doc (row 10), they gate on gestational age >= 20 weeks
    // instead, not on met-beneficiary — see the dedicated test below.
    //
    // lmp_date_edit/upload_sonography_report_image are excluded here: they
    // gate on do_you_have_a_sonography_report_to_confirm_the_lmp_date=yes
    // instead — that field is itself gated on met-beneficiary=yes, so the
    // met-beneficiary condition still applies, one step removed. See the
    // dedicated test below.
    //
    // how_many_ifa_tablets_did_you_consume_since_last_visit is excluded
    // here: per the source doc (row 36-37), it gates on
    // are_you_taking_ifa_tablets=yes instead — that field is itself gated
    // on met-beneficiary=yes, same one-step-removed pattern as the
    // sonography-report group above. See the dedicated test below.
    //
    // if_yes_enter_date_of_latest_anc_visit_at_the_health_facility is
    // excluded here: per the source doc (Q40/Q41), it gates on
    // have_you_visited_health_facility_since_my_last_visit=yes instead —
    // that field is itself gated on met-beneficiary=yes, same
    // one-step-removed pattern as the groups above. See the dedicated test
    // below.
    for (const field of fields) {
      if (
        [
          'date_of_visit',
          'visit_type',
          'have_you_been_able_to_meet_the_beneficiary_for_the_visit',
          'if_no_mention_reasons',
          'fetal_movements',
          'fetal_heart_rate',
          'fundal_height_in_cm',
          'lmp_date_edit',
          'upload_sonography_report_image',
          'how_many_ifa_tablets_did_you_consume_since_last_visit',
          'if_yes_enter_date_of_latest_anc_visit_at_the_health_facility',
        ].includes(field.question_code)
      ) {
        continue;
      }
      expect(field.visibleWhen).toEqual(MET_BENEFICIARY_YES);
    }
  });

  it('shows fetal_movements/fetal_heart_rate/fundal_height_in_cm only from 20 weeks gestation (row 10)', () => {
    const GESTATIONAL_AGE_GTE_20 = {
      field: 'current_gestational_age_in_weeks',
      operator: 'gte',
      value: '20',
    };
    for (const code of ['fetal_movements', 'fetal_heart_rate', 'fundal_height_in_cm']) {
      expect(byCode.get(code)?.visibleWhen).toEqual(GESTATIONAL_AGE_GTE_20);
    }
  });

  it('shows the IFA tablet count only when are_you_taking_ifa_tablets=yes (row 36-37)', () => {
    expect(
      byCode.get('how_many_ifa_tablets_did_you_consume_since_last_visit')?.visibleWhen,
    ).toEqual({
      field: 'are_you_taking_ifa_tablets',
      operator: 'eq',
      value: 'yes',
    });
    // The gating field itself is still met-beneficiary-gated, so the chain
    // as a whole reduces to met-beneficiary=yes AND are-taking-ifa=yes.
    expect(byCode.get('are_you_taking_ifa_tablets')?.visibleWhen).toEqual(MET_BENEFICIARY_YES);
  });

  it('gates the LMP-edit date and sonography image behind having a sonography report, not met-beneficiary directly', () => {
    const HAS_SONOGRAPHY_REPORT_YES = {
      field: 'do_you_have_a_sonography_report_to_confirm_the_lmp_date',
      operator: 'eq',
      value: 'yes',
    };
    expect(byCode.get('lmp_date_edit')?.visibleWhen).toEqual(HAS_SONOGRAPHY_REPORT_YES);
    expect(byCode.get('upload_sonography_report_image')?.visibleWhen).toEqual(
      HAS_SONOGRAPHY_REPORT_YES,
    );
    // The gating field itself is still met-beneficiary-gated, so the chain
    // as a whole reduces to met-beneficiary=yes AND has-report=yes.
    expect(
      byCode.get('do_you_have_a_sonography_report_to_confirm_the_lmp_date')?.visibleWhen,
    ).toEqual(MET_BENEFICIARY_YES);
  });

  it('shows the latest-ANC-visit date only when have_you_visited_health_facility_since_my_last_visit=yes (Q40/Q41)', () => {
    expect(
      byCode.get('if_yes_enter_date_of_latest_anc_visit_at_the_health_facility')?.visibleWhen,
    ).toEqual({
      field: 'have_you_visited_health_facility_since_my_last_visit',
      operator: 'eq',
      value: 'yes',
    });
    // The gating field itself is still met-beneficiary-gated, so the chain
    // as a whole reduces to met-beneficiary=yes AND visited-facility=yes.
    expect(byCode.get('have_you_visited_health_facility_since_my_last_visit')?.visibleWhen).toEqual(
      MET_BENEFICIARY_YES,
    );
  });

  it('applies notFuture to the LMP edit date (Q8)', () => {
    expect(byCode.get('lmp_date_edit')?.dateRule).toEqual({ notFuture: true });
  });

  it('applies notFuture to the latest-ANC-visit date (Q41)', () => {
    expect(
      byCode.get('if_yes_enter_date_of_latest_anc_visit_at_the_health_facility')?.dateRule,
    ).toEqual({ notFuture: true });
  });

  it('applies notFuture + notBefore LMP to the USG date (Q49)', () => {
    expect(byCode.get('if_yes_date_of_usg')?.dateRule).toEqual({
      notFuture: true,
      notBefore: { field: 'lmp' },
    });
  });

  it('has an EXCLUSIVE_OPTION rule so "Normal" urine test cannot combine with other findings (Q29)', () => {
    expect(ancVisit.validationJson).toContainEqual({
      rule: 'EXCLUSIVE_OPTION',
      field: 'urine_test',
      exclusiveValues: ['normal'],
    });
  });

  it('has an EXCLUSIVE_OPTION rule so "None" cannot combine with a selected Td dose (Q33)', () => {
    expect(ancVisit.validationJson).toContainEqual({
      rule: 'EXCLUSIVE_OPTION',
      field: 'vaccination_status',
      exclusiveValues: ['none'],
    });
  });

  it('has 2 total validationJson rules (2 EXCLUSIVE_OPTION)', () => {
    expect(ancVisit.validationJson).toHaveLength(2);
  });
});

describe('infant-visit.json', () => {
  const fields = infantVisit.schemaJson;
  const byCode = new Map(fields.map((f) => [f.question_code, f]));

  it('has exactly 81 fields, per the Revised App Form Final Infant Visits form', () => {
    expect(fields).toHaveLength(81);
  });

  it('groups fields into Tests, Symptoms, History, in that order', () => {
    const sections = fields.map((f) => f.section);
    const firstSymptoms = sections.indexOf('Symptoms');
    const firstHistory = sections.indexOf('History');

    expect(sections.slice(0, firstSymptoms).every((s) => s === 'Tests')).toBe(true);
    expect(sections.slice(firstSymptoms, firstHistory).every((s) => s === 'Symptoms')).toBe(true);
    expect(sections.slice(firstHistory).every((s) => s === 'History')).toBe(true);
    expect(sections.filter((s) => s === 'Tests')).toHaveLength(12);
    expect(sections.filter((s) => s === 'Symptoms')).toHaveLength(20);
    expect(sections.filter((s) => s === 'History')).toHaveLength(49);
  });

  it('applies numericRange to every field the source doc bounds', () => {
    const expectedRanges: Record<string, { min: number; max: number }> = {
      birth_weight_in_kg: { min: 0.5, max: 6 },
      length_of_the_baby_at_the_time_of_birth_in_cm: { min: 25, max: 99 },
      child_temprature_in_f: { min: 93, max: 105 },
      child_respiratory_rate_2_12_months: { min: 10, max: 90 },
      current_length_in_cm: { min: 25, max: 99 },
      current_weight_in_kg: { min: 0.5, max: 15 },
      muac_in_cms: { min: 5, max: 25 },
    };

    for (const [code, range] of Object.entries(expectedRanges)) {
      expect(byCode.get(code)?.numericRange).toEqual(range);
    }
  });

  // visibleWhen is a single {field,operator,value} object only — never an
  // array of ANDed conditions. The mobile client's FormVisibilityEvaluator
  // does not parse an array shape and crashes the whole form load if it sees
  // one (2026-08-07 incident: ANC_VISIT became unopenable for every Sakhi).
  // Fields that would otherwise need two conditions (their own condition AND
  // "met beneficiary = yes") keep only the met-beneficiary gate — the more
  // recently confirmed, higher-impact fix — until mobile ships array support
  // and these two-condition fields (age gating, complementary-feeding
  // gating, per-vaccine date gating) can be restored.
  const MET_BENEFICIARY_YES_INFANT = {
    field: 'have_you_been_able_to_meet_the_beneficiary_for_the_visit',
    operator: 'eq',
    value: 'yes',
  };

  it('never stores visibleWhen as an array — mobile only parses a single condition object', () => {
    for (const field of fields) {
      if (field.visibleWhen !== undefined) {
        expect(Array.isArray(field.visibleWhen)).toBe(false);
      }
    }
  });

  it('shows the not-met reason only when the beneficiary was not met', () => {
    // The only Q5+ field NOT gated behind met=yes — it's the met=no branch itself.
    expect(byCode.get('if_no_mention_reasons')?.visibleWhen).toEqual({
      field: 'have_you_been_able_to_meet_the_beneficiary_for_the_visit',
      operator: 'eq',
      value: 'no',
    });
  });

  it('gates every Q5+ field behind met-beneficiary=yes', () => {
    for (const field of fields) {
      if (
        [
          'date_of_visit',
          'visit_type',
          'have_you_been_able_to_meet_the_beneficiary_for_the_visit',
          'if_no_mention_reasons',
        ].includes(field.question_code)
      ) {
        continue;
      }
      expect(field.visibleWhen).toEqual(MET_BENEFICIARY_YES_INFANT);
    }
  });

  it('has every vaccine date field present, gated behind met-beneficiary=yes', () => {
    const vaccinePairs: [string, string][] = [
      ['bcg', 'bcg_date'],
      ['opv_0', 'opv_0_date'],
      ['hepatitis_b_birth_dose', 'hepatitis_b_date_birth_dose'],
      ['vitamin_k', 'vitamin_k_date'],
      ['opv_1', 'opv_1_date'],
      ['pentavalent_1_dpt1', 'pentavalent_1_dpt1_date'],
      ['ipv_1', 'ipv_1_date'],
      ['rotavirus1', 'rotavirus1_date'],
      ['pcv1', 'pcv1_date'],
      ['opv_2', 'opv_2_date'],
      ['pentavalent_2_dpt2', 'pentavalent_2_dpt2_date'],
      ['rotavirus2', 'rotavirus2_date'],
      ['opv_3', 'opv_3_date'],
      ['pentavalent_3_dpt3', 'pentavalent_3_dpt3_date'],
      ['ipv2', 'ipv2_date'],
      ['rotavirus3', 'rotavirus3_date'],
      ['pcv2', 'pcv2_date'],
      ['mmr_1_mr1', 'mmr_1_mr1_date'],
      ['pcv_booster', 'pcv_booster_date'],
      ['vitamin_a', 'vitamin_a_date'],
      ['opv_booster', 'opv_booster_date'],
      ['mmr2_mr2', 'mmr2_mr2_date'],
      ['dpt_booster1', 'dpt_booster1_date'],
    ];

    for (const [vaccineCode, dateCode] of vaccinePairs) {
      expect(byCode.get(vaccineCode)).toBeDefined();
      expect(byCode.get(dateCode)?.visibleWhen).toEqual(MET_BENEFICIARY_YES_INFANT);
    }
  });

  it('has no cross-field validation rules', () => {
    expect(infantVisit.validationJson).toEqual([]);
  });
});

describe('delivery-visit.json', () => {
  const fields = deliveryVisit.schemaJson;
  const byCode = new Map(fields.map((f) => [f.question_code, f]));

  it('has exactly 44 fields (13 mother-level + 3x10 child fields + remarks)', () => {
    expect(fields).toHaveLength(44);
  });

  it('applies numericRange to every field the source doc bounds', () => {
    const expectedRanges: Record<string, { min: number; max: number }> = {
      number_of_babies_born: { min: 1, max: 3 },
      child1_birth_length_cm: { min: 35, max: 60 },
      child1_birth_weight_kg: { min: 0.5, max: 6 },
      child2_birth_length_cm: { min: 35, max: 60 },
      child2_birth_weight_kg: { min: 0.5, max: 6 },
      child3_birth_length_cm: { min: 35, max: 60 },
      child3_birth_weight_kg: { min: 0.5, max: 6 },
    };
    for (const [code, range] of Object.entries(expectedRanges)) {
      expect(byCode.get(code)?.numericRange).toEqual(range);
    }
  });

  it('gates home-delivery-only fields behind place_of_delivery=home', () => {
    const HOME_GATE = { field: 'place_of_delivery', operator: 'eq', value: 'home' };
    expect(byCode.get('misoprostol_tablets_taken_back')?.visibleWhen).toEqual(HOME_GATE);
    expect(byCode.get('reason_for_home_delivery')?.visibleWhen).toEqual(HOME_GATE);
  });

  it('gates child2/child3 fields behind number_of_babies_born (row 12)', () => {
    for (const code of [
      'child2_delivery_outcome',
      'child2_sex_of_baby',
      'child2_birth_length_cm',
      'child2_birth_weight_kg',
    ]) {
      expect(byCode.get(code)?.visibleWhen).toEqual({
        field: 'number_of_babies_born',
        operator: 'gte',
        value: 2,
      });
    }
    for (const code of [
      'child3_delivery_outcome',
      'child3_sex_of_baby',
      'child3_birth_length_cm',
      'child3_birth_weight_kg',
    ]) {
      expect(byCode.get(code)?.visibleWhen).toEqual({
        field: 'number_of_babies_born',
        operator: 'gte',
        value: 3,
      });
    }
  });

  it('correctly defines childN_sex_of_baby as Male/Female/Intersex-Other, not cause-of-death — the source doc mislabels this row for Child3 (row 28)', () => {
    for (const code of ['child1_sex_of_baby', 'child2_sex_of_baby', 'child3_sex_of_baby']) {
      const field = byCode.get(code);
      expect(field?.options?.map((o) => o.value_code)).toEqual([
        'male',
        'female',
        'intersex_other',
      ]);
    }
  });

  it('gates each childN death-detail block behind that same child being reported not alive', () => {
    for (const prefix of ['child1', 'child2', 'child3']) {
      const gate = { field: `${prefix}_is_newborn_alive_now`, operator: 'eq', value: 'no' };
      expect(byCode.get(`${prefix}_cause_of_death`)?.visibleWhen).toEqual(gate);
      expect(byCode.get(`${prefix}_place_of_death`)?.visibleWhen).toEqual(gate);
      expect(byCode.get(`${prefix}_date_of_death`)?.visibleWhen).toEqual(gate);
    }
  });

  it('applies notBefore date_of_delivery to every childN_date_of_death (death cannot precede birth)', () => {
    for (const prefix of ['child1', 'child2', 'child3']) {
      expect(byCode.get(`${prefix}_date_of_death`)?.dateRule).toEqual({
        notFuture: true,
        notBefore: { field: 'date_of_delivery' },
      });
    }
  });

  it('has an EXCLUSIVE_OPTION rule so "None" cannot combine with a selected delivery complication', () => {
    expect(deliveryVisit.validationJson).toContainEqual({
      rule: 'EXCLUSIVE_OPTION',
      field: 'did_mother_experience_complications',
      exclusiveValues: ['none'],
    });
  });
});

describe('postpartum-visit.json', () => {
  const fields = postpartumVisit.schemaJson;
  const byCode = new Map(fields.map((f) => [f.question_code, f]));

  it('has exactly 36 fields, per the Revised App Form Final Postpartum form', () => {
    expect(fields).toHaveLength(36);
  });

  it('applies numericRange to every field the source doc bounds', () => {
    const expectedRanges: Record<string, { min: number; max: number }> = {
      ifa_tablets_consumed_since_last_visit: { min: 0, max: 35 },
      current_weight_kg: { min: 25, max: 100 },
      current_muac_cm: { min: 10, max: 40 },
      bp_systolic: { min: 70, max: 300 },
      bp_diastolic: { min: 40, max: 130 },
      body_temperature_f: { min: 94, max: 105 },
      haemoglobin_g_dl: { min: 1, max: 18 },
      random_blood_glucose_mg_dl: { min: 40, max: 400 },
      anc_visits_completed_before_delivery: { min: 0, max: 20 },
    };
    for (const [code, range] of Object.entries(expectedRanges)) {
      expect(byCode.get(code)?.numericRange).toEqual(range);
    }
  });

  it('short-circuits the rest of the form when the mother is not alive (row 3)', () => {
    expect(byCode.get('is_mother_alive')?.required).toBe(true);
    // Every subsequent mandatory field is gated behind is_mother_alive=yes,
    // except anc_visits_completed_before_delivery, which the doc places
    // outside the mother-status-gated flow (row 36).
    for (const field of fields) {
      if (
        [
          'actual_visit_date',
          'visit_name',
          'is_mother_alive',
          'anc_visits_completed_before_delivery',
        ].includes(field.question_code)
      ) {
        continue;
      }
      if (field.visibleWhen?.field === 'is_mother_alive') {
        expect(field.visibleWhen).toEqual({
          field: 'is_mother_alive',
          operator: 'eq',
          value: 'yes',
        });
      }
    }
  });

  it('requires pads-changed-per-day only when bleeding has not stopped (row 11-12)', () => {
    expect(byCode.get('pads_changed_per_day')?.visibleWhen).toEqual({
      field: 'vaginal_bleeding_stopped',
      operator: 'eq',
      value: 'no',
    });
  });

  it('requires breastfeeding-difficulties only when breastfeeding is uncomfortable (row 13-14)', () => {
    expect(byCode.get('breastfeeding_difficulties')?.visibleWhen).toEqual({
      field: 'able_to_breastfeed_comfortably',
      operator: 'eq',
      value: 'no',
    });
  });

  it('requires the IFA non-consumption reason only when not taking IFA (row 18-20)', () => {
    expect(byCode.get('reason_for_non_consumption_of_ifa')?.visibleWhen).toEqual({
      field: 'taking_ifa_tablets',
      operator: 'eq',
      value: 'no',
    });
  });

  it('requires family planning method only when using family planning (row 22-23)', () => {
    expect(byCode.get('family_planning_methods')?.visibleWhen).toEqual({
      field: 'using_family_planning',
      operator: 'eq',
      value: 'yes',
    });
  });

  it('wires current_bmi to the BMI computed formula (row 28)', () => {
    expect(byCode.get('current_bmi')?.computedFrom).toBe('BMI');
  });

  it('has 5 EXCLUSIVE_OPTION rules for the "none/no abnormal signs" checkbox groups', () => {
    const exclusiveRules = postpartumVisit.validationJson.filter(
      (r) => (r as { rule: string }).rule === 'EXCLUSIVE_OPTION',
    );
    expect(exclusiveRules).toHaveLength(5);
  });
});

describe('neonatal-visit.json', () => {
  const fields = neonatalVisit.schemaJson;
  const byCode = new Map(fields.map((f) => [f.question_code, f]));

  it('has exactly 32 fields (26 base + 4 per-vaccine date fields + 2 pre-filled delivery fields)', () => {
    expect(fields).toHaveLength(32);
  });

  it('applies numericRange to birth/current length and weight', () => {
    const expectedRanges: Record<string, { min: number; max: number }> = {
      birth_weight_kg: { min: 0.5, max: 6 },
      current_length_cm: { min: 35, max: 60 },
      current_weight_kg: { min: 0.5, max: 6 },
    };
    for (const [code, range] of Object.entries(expectedRanges)) {
      expect(byCode.get(code)?.numericRange).toEqual(range);
    }
  });

  it('gates the death-detail block behind is_newborn_alive_now=no', () => {
    const gate = { field: 'is_newborn_alive_now', operator: 'eq', value: 'no' };
    expect(byCode.get('cause_of_death')?.visibleWhen).toEqual(gate);
    expect(byCode.get('place_of_death')?.visibleWhen).toEqual(gate);
    expect(byCode.get('date_of_death')?.visibleWhen).toEqual(gate);
  });

  it('gates the KMC block behind birth_weight_kg < 2.5 (row 11, low-birth-weight eligibility)', () => {
    expect(byCode.get('is_kmc_practiced')?.visibleWhen).toEqual({
      field: 'birth_weight_kg',
      operator: 'lt',
      value: 2.5,
    });
    expect(byCode.get('kmc_duration')?.visibleWhen).toEqual({
      field: 'is_kmc_practiced',
      operator: 'eq',
      value: 'yes',
    });
    expect(byCode.get('kmc_breastfeeding_duration')?.visibleWhen).toEqual({
      field: 'is_kmc_practiced',
      operator: 'eq',
      value: 'yes',
    });
  });

  it('wires nutritional-status fields to the NUTRITIONAL_ZSCORE computed formula (rows 23-25)', () => {
    for (const code of [
      'nutritional_status_wasting',
      'nutritional_status_stunting',
      'nutritional_status_underweight',
    ]) {
      expect(byCode.get(code)?.computedFrom).toBe('NUTRITIONAL_ZSCORE');
    }
  });

  it('has an EXCLUSIVE_OPTION rule so "None" cannot combine with a selected vaccine', () => {
    expect(neonatalVisit.validationJson).toContainEqual({
      rule: 'EXCLUSIVE_OPTION',
      field: 'vaccination_taken_at_birth',
      exclusiveValues: ['none'],
    });
  });

  it('has a REQUIRED_IF_SELECTED rule so each selected vaccine requires its date', () => {
    expect(neonatalVisit.validationJson).toContainEqual({
      rule: 'REQUIRED_IF_SELECTED',
      field: 'vaccination_taken_at_birth',
      optionFieldMap: {
        bcg: 'bcg_date',
        opv: 'opv_date',
        hepatitis_b: 'hepatitis_b_date',
        vitamin_k: 'vitamin_k_date',
      },
    });
  });

  it('has 4 total validationJson rules (2 EXCLUSIVE_OPTION + 1 EXCLUSIVE_OPTION for feeding concerns + 1 REQUIRED_IF_SELECTED)', () => {
    expect(neonatalVisit.validationJson).toHaveLength(4);
  });
});
