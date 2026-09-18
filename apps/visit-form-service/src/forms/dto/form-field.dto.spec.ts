import { formFieldSchema } from './form-field.dto';

function baseField(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    question_code: 'sample_field',
    label: 'Sample field',
    input_type: 'text',
    required: false,
    ...overrides,
  };
}

describe('formFieldSchema — visibleWhen', () => {
  it('accepts a single {field,operator,value} condition', () => {
    const result = formFieldSchema.safeParse(
      baseField({
        visibleWhen: { field: 'met_beneficiary', operator: 'eq', value: 'yes' },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a field with no visibleWhen at all', () => {
    const result = formFieldSchema.safeParse(baseField());
    expect(result.success).toBe(true);
  });

  it(
    'rejects an array-of-conditions visibleWhen — the mobile client cannot parse it and ' +
      'crashes the whole form load (the ANC_VISIT/INFANT_VISIT incident this schema-level ' +
      'rejection follows)',
    () => {
      const result = formFieldSchema.safeParse(
        baseField({
          visibleWhen: [
            { field: 'met_beneficiary', operator: 'eq', value: 'yes' },
            { field: 'has_usg_report', operator: 'eq', value: 'yes' },
          ],
        }),
      );
      expect(result.success).toBe(false);
    },
  );

  it('rejects a single-element array — the array shape itself is rejected, not just multi-condition arrays', () => {
    const result = formFieldSchema.safeParse(
      baseField({
        visibleWhen: [{ field: 'met_beneficiary', operator: 'eq', value: 'yes' }],
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe('formFieldSchema — defaultWhen', () => {
  it('accepts a valid {field,operator,value,defaultValue} condition', () => {
    const result = formFieldSchema.safeParse(
      baseField({
        defaultWhen: {
          field: 'referral_needed_new_condition',
          operator: 'eq',
          value: 'no',
          defaultValue: 'no',
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a field with no defaultWhen at all', () => {
    const result = formFieldSchema.safeParse(baseField());
    expect(result.success).toBe(true);
  });

  it('rejects a defaultWhen missing defaultValue', () => {
    const result = formFieldSchema.safeParse(
      baseField({
        defaultWhen: { field: 'referral_needed_new_condition', operator: 'eq', value: 'no' },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a defaultWhen missing field/operator', () => {
    const result = formFieldSchema.safeParse(
      baseField({
        defaultWhen: { defaultValue: 'no' },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('is independent of visibleWhen — a field may declare both', () => {
    const result = formFieldSchema.safeParse(
      baseField({
        visibleWhen: { field: 'beneficiary_willing_for_referral', operator: 'eq', value: 'no' },
        defaultWhen: {
          field: 'referral_needed_new_condition',
          operator: 'eq',
          value: 'no',
          defaultValue: 'no',
        },
      }),
    );
    expect(result.success).toBe(true);
  });
});

describe('formFieldSchema — computedFrom', () => {
  it('accepts DOB_PLUS_365 (CH-09: Infant Registration date_of_last_visit_12months)', () => {
    const result = formFieldSchema.safeParse(baseField({ computedFrom: 'DOB_PLUS_365' }));
    expect(result.success).toBe(true);
  });

  it('rejects an unrecognized computedFrom token', () => {
    const result = formFieldSchema.safeParse(baseField({ computedFrom: 'NOT_A_REAL_FORMULA' }));
    expect(result.success).toBe(false);
  });

  it('accepts a field with no computedFrom at all', () => {
    const result = formFieldSchema.safeParse(baseField());
    expect(result.success).toBe(true);
  });
});

describe('formFieldSchema — question_code length', () => {
  it('accepts a question_code at exactly 120 characters (form_answers.field_code is VarChar(120))', () => {
    const result = formFieldSchema.safeParse(baseField({ question_code: 'a'.repeat(120) }));
    expect(result.success).toBe(true);
  });

  it(
    'rejects a question_code over 120 characters — form_answers.field_code is VarChar(120); ' +
      'an over-length code previously passed schema validation uncaught and only failed at ' +
      'submission time as a Prisma P2000 500 (MOTHER_REGISTRATION incident this rejection follows)',
    () => {
      const result = formFieldSchema.safeParse(baseField({ question_code: 'a'.repeat(121) }));
      expect(result.success).toBe(false);
    },
  );
});
