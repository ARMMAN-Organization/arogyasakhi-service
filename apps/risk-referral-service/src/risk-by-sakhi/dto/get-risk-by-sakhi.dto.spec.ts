import { riskBySakhiParamsSchema, riskBySakhiQuerySchema } from './get-risk-by-sakhi.dto';

describe('riskBySakhiParamsSchema', () => {
  const UUID = '11111111-1111-1111-1111-111111111111';

  it('accepts a valid uuid sakhiId', () => {
    const result = riskBySakhiParamsSchema.safeParse({ sakhiId: UUID });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed sakhiId', () => {
    const result = riskBySakhiParamsSchema.safeParse({ sakhiId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = riskBySakhiParamsSchema.safeParse({ sakhiId: UUID, extra: 'nope' });
    expect(result.success).toBe(false);
  });
});

describe('riskBySakhiQuerySchema', () => {
  it('accepts a missing type (requests every phase)', () => {
    const result = riskBySakhiQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts type=ANC', () => {
    const result = riskBySakhiQuerySchema.safeParse({ type: 'ANC' });
    expect(result.success).toBe(true);
  });

  it('accepts type=PNC', () => {
    const result = riskBySakhiQuerySchema.safeParse({ type: 'PNC' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid type value', () => {
    const result = riskBySakhiQuerySchema.safeParse({ type: 'NN' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = riskBySakhiQuerySchema.safeParse({ type: 'ANC', extra: 'nope' });
    expect(result.success).toBe(false);
  });
});
