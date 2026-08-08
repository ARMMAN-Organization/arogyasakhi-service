import { isVisible, validateSubmission } from './form-validation';
import type { FormField, CrossFieldRule } from './dto/form-field.dto';

const gravidaField: FormField = {
  question_code: 'gravida_total_number_of_pregnancies',
  label: 'Gravida',
  input_type: 'number',
  required: true,
};

const livingChildrenField: FormField = {
  question_code: 'living_children',
  label: 'Living children',
  input_type: 'number',
  required: true,
};

const stillBirthsField: FormField = {
  question_code: 'still_births',
  label: 'Still births',
  input_type: 'number',
  required: true,
};

const abortionsField: FormField = {
  question_code: 'abortions_pregnancy_losses_before_24_weeks',
  label: 'Abortions',
  input_type: 'number',
  required: false,
};

const fields: FormField[] = [gravidaField, livingChildrenField, stillBirthsField, abortionsField];

const gravidaSumRule: CrossFieldRule = {
  rule: 'SUM_EQUALS',
  fields: ['living_children', 'still_births', 'abortions_pregnancy_losses_before_24_weeks'],
  equals: 'gravida_total_number_of_pregnancies',
  offset: 1,
};

describe('validateSubmission — SUM_EQUALS with offset', () => {
  it('passes when the sum plus offset equals the target field', () => {
    const violations = validateSubmission(fields, [gravidaSumRule], {
      living_children: 1,
      still_births: 0,
      abortions_pregnancy_losses_before_24_weeks: 1,
      gravida_total_number_of_pregnancies: 3,
    });

    expect(violations).toEqual([]);
  });

  it('flags a violation when the sum plus offset does not equal the target field', () => {
    const violations = validateSubmission(fields, [gravidaSumRule], {
      living_children: 1,
      still_births: 0,
      abortions_pregnancy_losses_before_24_weeks: 1,
      gravida_total_number_of_pregnancies: 5,
    });

    expect(violations).toEqual([
      'living_children + still_births + abortions_pregnancy_losses_before_24_weeks + 1 must equal gravida_total_number_of_pregnancies',
    ]);
  });

  it('behaves as a plain sum when offset is omitted', () => {
    const ruleWithoutOffset: CrossFieldRule = {
      rule: 'SUM_EQUALS',
      fields: ['living_children', 'still_births'],
      equals: 'gravida_total_number_of_pregnancies',
    };

    const violations = validateSubmission(fields, [ruleWithoutOffset], {
      living_children: 2,
      still_births: 1,
      gravida_total_number_of_pregnancies: 3,
    });

    expect(violations).toEqual([]);
  });

  it('skips the rule when any referenced field is absent', () => {
    const violations = validateSubmission(fields, [gravidaSumRule], {
      living_children: 1,
      still_births: 0,
      gravida_total_number_of_pregnancies: 3,
    });

    expect(violations).toEqual([]);
  });

  it('flags non-numeric values among the summed or target fields', () => {
    const violations = validateSubmission(fields, [gravidaSumRule], {
      living_children: 'not-a-number',
      still_births: 0,
      abortions_pregnancy_losses_before_24_weeks: 1,
      gravida_total_number_of_pregnancies: 3,
    });

    expect(violations).toEqual([
      'living_children, still_births, abortions_pregnancy_losses_before_24_weeks and gravida_total_number_of_pregnancies must all be numeric',
    ]);
  });
});

describe('validateSubmission — exactLength', () => {
  const mobileNumberField: FormField = {
    question_code: 'mobile_number',
    label: 'Mobile number',
    input_type: 'number',
    required: true,
    exactLength: 10,
  };

  it('passes when the value has exactly the required digit count', () => {
    const violations = validateSubmission([mobileNumberField], [], {
      mobile_number: '9876543210',
    });

    expect(violations).toEqual([]);
  });

  it('flags a violation when the value is shorter than the required length', () => {
    const violations = validateSubmission([mobileNumberField], [], {
      mobile_number: '98765',
    });

    expect(violations).toEqual(['mobile_number must be exactly 10 digits']);
  });

  it('flags a violation when the value is longer than the required length', () => {
    const violations = validateSubmission([mobileNumberField], [], {
      mobile_number: '987654321099',
    });

    expect(violations).toEqual(['mobile_number must be exactly 10 digits']);
  });

  it('skips the exactLength check when the value is absent and not required', () => {
    const optionalField: FormField = { ...mobileNumberField, required: false };

    const violations = validateSubmission([optionalField], [], {});

    expect(violations).toEqual([]);
  });
});

describe('validateSubmission — ANY_OF_REQUIRED', () => {
  const dateOfBirthField: FormField = {
    question_code: 'date_of_birth',
    label: 'Date of birth',
    input_type: 'date',
    required: false,
  };

  const ageField: FormField = {
    question_code: 'age_of_the_beneficiary',
    label: 'Age of the beneficiary',
    input_type: 'number',
    required: false,
    computedFrom: 'AGE_FROM_DOB',
    numericRange: { min: 10, max: 50 },
  };

  const eitherAgeFieldRule: CrossFieldRule = {
    rule: 'ANY_OF_REQUIRED',
    fields: ['date_of_birth', 'age_of_the_beneficiary'],
  };

  it('rejects when every field in the rule is empty', () => {
    const violations = validateSubmission([dateOfBirthField, ageField], [eitherAgeFieldRule], {});

    expect(violations).toEqual([
      'At least one of date_of_birth, age_of_the_beneficiary must be answered',
    ]);
  });

  it('accepts when only date_of_birth is answered', () => {
    const violations = validateSubmission([dateOfBirthField, ageField], [eitherAgeFieldRule], {
      date_of_birth: '1995-05-20',
    });

    expect(violations).toEqual([]);
  });

  it('accepts when only age_of_the_beneficiary is answered', () => {
    const violations = validateSubmission([dateOfBirthField, ageField], [eitherAgeFieldRule], {
      age_of_the_beneficiary: 25,
    });

    expect(violations).toEqual([]);
  });

  it('still enforces numericRange on a computedFrom field when a value is submitted', () => {
    const violations = validateSubmission([dateOfBirthField, ageField], [eitherAgeFieldRule], {
      age_of_the_beneficiary: 5,
    });

    expect(violations).toEqual(['age_of_the_beneficiary must be between 10 and 50']);
  });

  it('does not flag a computedFrom field as missing when required is true and it is empty', () => {
    const requiredAgeField: FormField = { ...ageField, required: true };

    const violations = validateSubmission([requiredAgeField], [], {});

    expect(violations).toEqual([]);
  });
});

describe('isVisible — contains operator', () => {
  const td1DateField: FormField = {
    question_code: 'td_1_date',
    label: 'Td-1 date',
    input_type: 'date',
    required: false,
    visibleWhen: {
      field: 'has_the_women_received_td_dose',
      operator: 'contains',
      value: 'td_1_date',
    },
  };

  it('is visible when the value is one of the checked options', () => {
    const visible = isVisible(td1DateField, {
      has_the_women_received_td_dose: ['td_1_date', 'td_2_date'],
    });

    expect(visible).toBe(true);
  });

  it('is hidden when the value is not among the checked options', () => {
    const visible = isVisible(td1DateField, {
      has_the_women_received_td_dose: ['none_received_yet'],
    });

    expect(visible).toBe(false);
  });

  it('is hidden when the gating field is empty', () => {
    const visible = isVisible(td1DateField, {});

    expect(visible).toBe(false);
  });

  it('is hidden when the gating field is not an array', () => {
    const visible = isVisible(td1DateField, {
      has_the_women_received_td_dose: 'td_1_date',
    });

    expect(visible).toBe(false);
  });
});

describe('validateSubmission — dateRule (LMP: notFuture, notAfter, minDaysFrom, maxDaysFrom)', () => {
  const registrationDateField: FormField = {
    question_code: 'registration_date',
    label: 'Registration date',
    input_type: 'date',
    required: true,
  };

  const lmpDateField: FormField = {
    question_code: 'lmp_date',
    label: 'LMP Date',
    input_type: 'date',
    required: false,
    dateRule: {
      notFuture: true,
      notAfter: { field: 'registration_date' },
      minDaysFrom: { field: 'registration_date', days: 30 },
      maxDaysFrom: { field: 'registration_date', days: 240 },
    },
  };

  const dateFields = [registrationDateField, lmpDateField];

  it('rejects a future LMP date', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const violations = validateSubmission(dateFields, [], {
      registration_date: future,
      lmp_date: future,
    });

    expect(violations).toContain('lmp_date must not be in the future');
  });

  it('rejects an LMP date after the registration date', () => {
    const violations = validateSubmission(dateFields, [], {
      registration_date: '2026-01-01',
      lmp_date: '2026-01-02',
    });

    expect(violations).toContain('lmp_date must not be after registration_date');
  });

  it('rejects when registration_date - lmp_date is 29 days (below the 30-day minimum)', () => {
    const violations = validateSubmission(dateFields, [], {
      registration_date: '2026-01-30',
      lmp_date: '2026-01-01',
    });

    expect(violations.some((v) => v.includes('at least 30 days'))).toBe(true);
  });

  it('accepts when registration_date - lmp_date is exactly 30 days (boundary)', () => {
    const violations = validateSubmission(dateFields, [], {
      registration_date: '2026-01-31',
      lmp_date: '2026-01-01',
    });

    expect(violations).toEqual([]);
  });

  it('accepts when registration_date - lmp_date is exactly 240 days (boundary)', () => {
    const violations = validateSubmission(dateFields, [], {
      registration_date: '2026-08-29',
      lmp_date: '2026-01-01',
    });

    expect(violations).toEqual([]);
  });

  it('rejects when registration_date - lmp_date is 241 days (above the max)', () => {
    const violations = validateSubmission(dateFields, [], {
      registration_date: '2026-08-30',
      lmp_date: '2026-01-01',
    });

    expect(violations.some((v) => v.includes('at most 240 days'))).toBe(true);
  });

  it('accepts a well-formed LMP date within range', () => {
    const violations = validateSubmission(dateFields, [], {
      registration_date: '2026-04-11',
      lmp_date: '2026-01-01',
    });

    expect(violations).toEqual([]);
  });

  it('skips the rule when either date is absent', () => {
    const violations = validateSubmission(dateFields, [], {
      registration_date: '2026-04-11',
    });

    expect(violations.filter((v) => v.includes('lmp_date'))).toEqual([]);
  });
});

describe('validateSubmission — dateRule (ANC-1 date: notBefore LMP, notAfter registration+5)', () => {
  const anc1DateField: FormField = {
    question_code: 'if_anc1_completed_please_record_the_date',
    label: 'ANC-1 date',
    input_type: 'date',
    required: true,
    visibleWhen: {
      field: 'has_the_woman_received_anc_check_ups_at_a_health_facility_during_this_pregnancy',
      operator: 'eq',
      value: 'anc_1_completed',
    },
    dateRule: {
      notBefore: { field: 'lmp_date' },
      notAfter: { field: 'registration_date', offsetDays: 5 },
    },
  };

  it('rejects an ANC-1 date before LMP', () => {
    const violations = validateSubmission([anc1DateField], [], {
      has_the_woman_received_anc_check_ups_at_a_health_facility_during_this_pregnancy:
        'anc_1_completed',
      lmp_date: '2026-01-10',
      registration_date: '2026-02-01',
      if_anc1_completed_please_record_the_date: '2026-01-05',
    });

    expect(violations).toContain(
      'if_anc1_completed_please_record_the_date must not be before lmp_date',
    );
  });

  it('accepts an ANC-1 date equal to the LMP date (inclusive boundary)', () => {
    const violations = validateSubmission([anc1DateField], [], {
      has_the_woman_received_anc_check_ups_at_a_health_facility_during_this_pregnancy:
        'anc_1_completed',
      lmp_date: '2026-01-10',
      registration_date: '2026-02-01',
      if_anc1_completed_please_record_the_date: '2026-01-10',
    });

    expect(violations).toEqual([]);
  });

  it('accepts an ANC-1 date exactly registration_date + 5 days (boundary)', () => {
    const violations = validateSubmission([anc1DateField], [], {
      has_the_woman_received_anc_check_ups_at_a_health_facility_during_this_pregnancy:
        'anc_1_completed',
      lmp_date: '2026-01-10',
      registration_date: '2026-02-01',
      if_anc1_completed_please_record_the_date: '2026-02-06',
    });

    expect(violations).toEqual([]);
  });

  it('rejects an ANC-1 date at registration_date + 6 days', () => {
    const violations = validateSubmission([anc1DateField], [], {
      has_the_woman_received_anc_check_ups_at_a_health_facility_during_this_pregnancy:
        'anc_1_completed',
      lmp_date: '2026-01-10',
      registration_date: '2026-02-01',
      if_anc1_completed_please_record_the_date: '2026-02-07',
    });

    expect(
      violations.some(
        (v) => v === 'if_anc1_completed_please_record_the_date must not be after registration_date',
      ),
    ).toBe(true);
  });

  it('skips the rule entirely when the field is hidden by visibleWhen', () => {
    const violations = validateSubmission([anc1DateField], [], {
      has_the_woman_received_anc_check_ups_at_a_health_facility_during_this_pregnancy:
        'not_started_anc_yet',
      lmp_date: '2026-01-10',
      registration_date: '2026-02-01',
      if_anc1_completed_please_record_the_date: '2020-01-01',
    });

    expect(violations).toEqual([]);
  });
});

describe('validateSubmission — dateRule (Td dose date ordering)', () => {
  const td1: FormField = {
    question_code: 'td_1_date',
    label: 'Td-1 date',
    input_type: 'date',
    required: false,
    dateRule: { notFuture: true },
  };
  const td2: FormField = {
    question_code: 'td_2_date',
    label: 'Td-2 date',
    input_type: 'date',
    required: false,
    dateRule: { notFuture: true, notBefore: { field: 'td_1_date' } },
  };
  const tdBooster: FormField = {
    question_code: 'td_booster_date',
    label: 'Td-Booster date',
    input_type: 'date',
    required: false,
    dateRule: { notFuture: true, notBefore: { field: 'td_2_date' } },
  };
  const tdFields = [td1, td2, tdBooster];

  it('rejects td_2_date before td_1_date', () => {
    const violations = validateSubmission(tdFields, [], {
      td_1_date: '2026-03-01',
      td_2_date: '2026-02-01',
    });

    expect(violations).toContain('td_2_date must not be before td_1_date');
  });

  it('accepts td_2_date after td_1_date', () => {
    const violations = validateSubmission(tdFields, [], {
      td_1_date: '2026-02-01',
      td_2_date: '2026-03-01',
    });

    expect(violations).toEqual([]);
  });

  it('rejects td_booster_date before td_2_date', () => {
    const violations = validateSubmission(tdFields, [], {
      td_2_date: '2026-03-01',
      td_booster_date: '2026-02-15',
    });

    expect(violations).toContain('td_booster_date must not be before td_2_date');
  });

  it('rejects a future Td date', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const violations = validateSubmission(tdFields, [], { td_1_date: future });

    expect(violations).toContain('td_1_date must not be in the future');
  });

  it('skips the rule when the field is not visible/present', () => {
    const violations = validateSubmission(tdFields, [], {});

    expect(violations).toEqual([]);
  });
});

describe('validateSubmission — EXCLUSIVE_OPTION', () => {
  const conditionField: FormField = {
    question_code:
      'have_you_ever_been_diagnosed_with_or_treated_for_any_of_the_following_medical_conditions',
    label: 'Diagnosed conditions',
    input_type: 'multiselect',
    required: false,
  };

  const exclusiveRule: CrossFieldRule = {
    rule: 'EXCLUSIVE_OPTION',
    field:
      'have_you_ever_been_diagnosed_with_or_treated_for_any_of_the_following_medical_conditions',
    exclusiveValues: ['no_known_medical_condition', 'don_t_know'],
  };

  it('accepts when only the exclusive value is selected', () => {
    const violations = validateSubmission([conditionField], [exclusiveRule], {
      have_you_ever_been_diagnosed_with_or_treated_for_any_of_the_following_medical_conditions: [
        'no_known_medical_condition',
      ],
    });

    expect(violations).toEqual([]);
  });

  it('accepts when only non-exclusive values are selected', () => {
    const violations = validateSubmission([conditionField], [exclusiveRule], {
      have_you_ever_been_diagnosed_with_or_treated_for_any_of_the_following_medical_conditions: [
        'hypertension_high_bp',
        'thyroid_disorder',
      ],
    });

    expect(violations).toEqual([]);
  });

  it('rejects when the exclusive value is combined with another option', () => {
    const violations = validateSubmission([conditionField], [exclusiveRule], {
      have_you_ever_been_diagnosed_with_or_treated_for_any_of_the_following_medical_conditions: [
        'no_known_medical_condition',
        'hypertension_high_bp',
      ],
    });

    expect(violations).toEqual([
      'have_you_ever_been_diagnosed_with_or_treated_for_any_of_the_following_medical_conditions cannot combine no_known_medical_condition/don_t_know with any other option',
    ]);
  });

  it('skips the rule when the field is empty or absent', () => {
    const violations = validateSubmission([conditionField], [exclusiveRule], {});

    expect(violations).toEqual([]);
  });

  it('applies independently per field for Q43/Q44/Q58-style rules', () => {
    const tdField: FormField = {
      question_code: 'has_the_women_received_td_dose',
      label: 'Td dose',
      input_type: 'multiselect_date',
      required: true,
    };
    const tdRule: CrossFieldRule = {
      rule: 'EXCLUSIVE_OPTION',
      field: 'has_the_women_received_td_dose',
      exclusiveValues: ['none_received_yet'],
    };

    const violations = validateSubmission([tdField], [tdRule], {
      has_the_women_received_td_dose: ['none_received_yet', 'td_1_date'],
    });

    expect(violations).toEqual([
      'has_the_women_received_td_dose cannot combine none_received_yet with any other option',
    ]);
  });
});

describe('validateSubmission — mother_beneficiary_id visibility (CHILD_REGISTRATION)', () => {
  const whoField: FormField = {
    question_code: 'who_are_you_registering_in_the_program',
    label: 'Who are you registering in the program?',
    input_type: 'radio',
    required: true,
  };
  const motherBeneficiaryIdField: FormField = {
    question_code: 'mother_beneficiary_id',
    label: 'Mother beneficiary ID',
    input_type: 'number',
    required: true,
    visibleWhen: {
      field: 'who_are_you_registering_in_the_program',
      operator: 'eq',
      value: 'child_of_a_registered_pregnant_woman',
    },
  };

  it('does not require mother_beneficiary_id when registering a child directly', () => {
    const violations = validateSubmission([whoField, motherBeneficiaryIdField], [], {
      who_are_you_registering_in_the_program: 'child_directly_mother_not_registered_in_the_program',
    });

    expect(violations).toEqual([]);
  });

  it('requires mother_beneficiary_id when registering a child of a registered pregnant woman', () => {
    const violations = validateSubmission([whoField, motherBeneficiaryIdField], [], {
      who_are_you_registering_in_the_program: 'child_of_a_registered_pregnant_woman',
    });

    expect(violations).toEqual(['Missing required field: mother_beneficiary_id']);
  });

  it('is satisfied when mother_beneficiary_id is present on the child-of-registered-woman path', () => {
    const violations = validateSubmission([whoField, motherBeneficiaryIdField], [], {
      who_are_you_registering_in_the_program: 'child_of_a_registered_pregnant_woman',
      mother_beneficiary_id: 12345,
    });

    expect(violations).toEqual([]);
  });
});

describe('validateSubmission — REQUIRED_IF_SELECTED', () => {
  const vaccineField: FormField = {
    question_code: 'vaccination_taken_at_birth',
    label: 'Vaccination taken at birth?',
    input_type: 'multiselect_date',
    required: true,
  };
  const bcgDateField: FormField = {
    question_code: 'bcg_date',
    label: 'BCG date',
    input_type: 'date',
    required: false,
  };
  const opvDateField: FormField = {
    question_code: 'opv_date',
    label: 'OPV date',
    input_type: 'date',
    required: false,
  };
  const requiredIfSelectedRule: CrossFieldRule = {
    rule: 'REQUIRED_IF_SELECTED',
    field: 'vaccination_taken_at_birth',
    optionFieldMap: { bcg_date: 'bcg_date', opv_date: 'opv_date' },
  };

  it('rejects when an option is selected but its paired date field is empty', () => {
    const violations = validateSubmission(
      [vaccineField, bcgDateField, opvDateField],
      [requiredIfSelectedRule],
      { vaccination_taken_at_birth: ['bcg_date'] },
    );

    expect(violations).toEqual(['bcg_date is required when bcg_date is selected']);
  });

  it('accepts when the selected option has its date filled', () => {
    const violations = validateSubmission(
      [vaccineField, bcgDateField, opvDateField],
      [requiredIfSelectedRule],
      { vaccination_taken_at_birth: ['bcg_date'], bcg_date: '2026-01-05' },
    );

    expect(violations).toEqual([]);
  });

  it('does not require a date for an option that was not selected', () => {
    const violations = validateSubmission(
      [vaccineField, bcgDateField, opvDateField],
      [requiredIfSelectedRule],
      { vaccination_taken_at_birth: ['opv_date'], opv_date: '2026-01-05' },
    );

    expect(violations).toEqual([]);
  });

  it('reports one violation per unfilled selected option', () => {
    const violations = validateSubmission(
      [vaccineField, bcgDateField, opvDateField],
      [requiredIfSelectedRule],
      { vaccination_taken_at_birth: ['bcg_date', 'opv_date'] },
    );

    expect(violations).toEqual([
      'bcg_date is required when bcg_date is selected',
      'opv_date is required when opv_date is selected',
    ]);
  });

  it('skips the rule when the field is empty or absent', () => {
    const optionalVaccineField: FormField = { ...vaccineField, required: false };
    const violations = validateSubmission(
      [optionalVaccineField, bcgDateField, opvDateField],
      [requiredIfSelectedRule],
      {},
    );

    expect(violations).toEqual([]);
  });
});

describe('validateSubmission — pattern (NAME_NO_SPECIAL_CHARS)', () => {
  const nameField: FormField = {
    question_code: 'beneficiary_name',
    label: 'Beneficiary name',
    input_type: 'text',
    required: true,
    pattern: 'NAME_NO_SPECIAL_CHARS',
  };

  it('accepts a plain name', () => {
    const violations = validateSubmission([nameField], [], { beneficiary_name: 'Jane Doe' });

    expect(violations).toEqual([]);
  });

  it('accepts a name with an apostrophe', () => {
    const violations = validateSubmission([nameField], [], { beneficiary_name: "O'Brien" });

    expect(violations).toEqual([]);
  });

  it('rejects a name containing digits', () => {
    const violations = validateSubmission([nameField], [], { beneficiary_name: 'Jane123' });

    expect(violations).toEqual(['beneficiary_name contains characters that are not allowed']);
  });

  it('rejects a name containing a symbol', () => {
    const violations = validateSubmission([nameField], [], { beneficiary_name: 'Jane@Doe' });

    expect(violations).toEqual(['beneficiary_name contains characters that are not allowed']);
  });

  it('accepts a name in a non-Latin script', () => {
    const violations = validateSubmission([nameField], [], { beneficiary_name: 'सुनीता देवी' });

    expect(violations).toEqual([]);
  });

  it('skips the pattern check when the value is absent', () => {
    const optionalNameField: FormField = { ...nameField, required: false };

    const violations = validateSubmission([optionalNameField], [], {});

    expect(violations).toEqual([]);
  });
});

describe('validateSubmission — dateRule (DOB of infant: notFuture, maxDaysFrom registration)', () => {
  const registrationDateField: FormField = {
    question_code: 'registrtion_date',
    label: 'Registration date',
    input_type: 'date',
    required: true,
  };

  const dobField: FormField = {
    question_code: 'date_of_birth_of_infant',
    label: 'Date of birth of infant',
    input_type: 'date',
    required: true,
    dateRule: {
      notFuture: true,
      maxDaysFrom: { field: 'registrtion_date', days: 183 },
    },
  };

  const dateFields = [registrationDateField, dobField];

  it('rejects a future date of birth', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const violations = validateSubmission(dateFields, [], {
      registrtion_date: future,
      date_of_birth_of_infant: future,
    });

    expect(violations).toContain('date_of_birth_of_infant must not be in the future');
  });

  it('accepts a date of birth exactly 183 days before registration (boundary)', () => {
    const violations = validateSubmission(dateFields, [], {
      registrtion_date: '2026-07-03',
      date_of_birth_of_infant: '2026-01-01',
    });

    expect(violations).toEqual([]);
  });

  it('rejects a date of birth 184 days before registration', () => {
    const violations = validateSubmission(dateFields, [], {
      registrtion_date: '2026-07-04',
      date_of_birth_of_infant: '2026-01-01',
    });

    expect(violations.some((v) => v.includes('at most 183 days'))).toBe(true);
  });

  it('accepts a date of birth within the 0-183 day window', () => {
    const violations = validateSubmission(dateFields, [], {
      registrtion_date: '2026-03-01',
      date_of_birth_of_infant: '2026-01-01',
    });

    expect(violations).toEqual([]);
  });

  it('skips the rule when registration date is absent', () => {
    const violations = validateSubmission(dateFields, [], {
      date_of_birth_of_infant: '2026-01-01',
    });

    expect(violations.filter((v) => v.includes('date_of_birth_of_infant'))).toEqual([]);
  });
});
