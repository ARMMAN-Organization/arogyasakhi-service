import { createReopenRequestSchema } from './create-reopen-request.dto';

describe('createReopenRequestSchema', () => {
  const baseInput = {
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    requestReason: 'MIGRATION_RETURNED' as const,
  };

  it('accepts a valid MIGRATION_RETURNED request', () => {
    expect(createReopenRequestSchema.safeParse(baseInput).success).toBe(true);
  });

  it('accepts CLOSED_BY_MISTAKE', () => {
    const result = createReopenRequestSchema.safeParse({
      ...baseInput,
      requestReason: 'CLOSED_BY_MISTAKE',
    });
    expect(result.success).toBe(true);
  });

  it('accepts OTHER', () => {
    const result = createReopenRequestSchema.safeParse({ ...baseInput, requestReason: 'OTHER' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing beneficiaryId', () => {
    const { beneficiaryId: _omit, ...rest } = baseInput;
    expect(createReopenRequestSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-UUID beneficiaryId', () => {
    const result = createReopenRequestSchema.safeParse({
      ...baseInput,
      beneficiaryId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid requestReason', () => {
    const result = createReopenRequestSchema.safeParse({
      ...baseInput,
      requestReason: 'SOME_OTHER_REASON',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    const result = createReopenRequestSchema.safeParse({
      ...baseInput,
      requestedByUserId: '33333333-3333-3333-3333-333333333333',
    });
    expect(result.success).toBe(false);
  });
});
