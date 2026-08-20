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
