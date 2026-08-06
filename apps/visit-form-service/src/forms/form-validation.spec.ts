import { validateSubmission } from './form-validation';
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
