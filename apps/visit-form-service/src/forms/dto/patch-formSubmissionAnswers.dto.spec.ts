import { patchFormSubmissionAnswersSchema } from './patch-formSubmissionAnswers.dto';

describe('patchFormSubmissionAnswersSchema', () => {
  it('accepts a single valid edit', () => {
    const result = patchFormSubmissionAnswersSchema.safeParse({
      edits: [{ fieldCode: 'enter_the_beneficiary_address', value: 'New address' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts up to 20 edits', () => {
    const edits = Array.from({ length: 20 }, (_, i) => ({
      fieldCode: `field_${i}`,
      value: i,
    }));
    const result = patchFormSubmissionAnswersSchema.safeParse({ edits });
    expect(result.success).toBe(true);
  });

  it('accepts string/number/boolean/array/object value shapes', () => {
    const result = patchFormSubmissionAnswersSchema.safeParse({
      edits: [
        { fieldCode: 'a', value: 'text' },
        { fieldCode: 'b', value: 42 },
        { fieldCode: 'c', value: true },
        { fieldCode: 'd', value: ['x', 'y'] },
        { fieldCode: 'e', value: { nested: 'ok' } },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty edits array', () => {
    const result = patchFormSubmissionAnswersSchema.safeParse({ edits: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 edits', () => {
    const edits = Array.from({ length: 21 }, (_, i) => ({
      fieldCode: `field_${i}`,
      value: i,
    }));
    const result = patchFormSubmissionAnswersSchema.safeParse({ edits });
    expect(result.success).toBe(false);
  });

  it('rejects a blank fieldCode', () => {
    const result = patchFormSubmissionAnswersSchema.safeParse({
      edits: [{ fieldCode: '   ', value: 'x' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing fieldCode', () => {
    const result = patchFormSubmissionAnswersSchema.safeParse({
      edits: [{ value: 'x' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing value', () => {
    const result = patchFormSubmissionAnswersSchema.safeParse({
      edits: [{ fieldCode: 'a' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bare null value (a null answer is expressed by omitting the edit, not value: null)', () => {
    const result = patchFormSubmissionAnswersSchema.safeParse({
      edits: [{ fieldCode: 'a', value: null }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown top-level fields (.strict())', () => {
    const result = patchFormSubmissionAnswersSchema.safeParse({
      edits: [{ fieldCode: 'a', value: 'x' }],
      extra: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields on an edit entry (.strict())', () => {
    const result = patchFormSubmissionAnswersSchema.safeParse({
      edits: [{ fieldCode: 'a', value: 'x', extra: true }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing edits array', () => {
    const result = patchFormSubmissionAnswersSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
