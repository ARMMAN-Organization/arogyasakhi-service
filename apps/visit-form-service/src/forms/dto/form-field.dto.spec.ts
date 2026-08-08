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
