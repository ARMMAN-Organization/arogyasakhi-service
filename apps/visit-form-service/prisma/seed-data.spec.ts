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
      expect(field.visibleWhen).toEqual(MET_BENEFICIARY_YES);
    }
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
