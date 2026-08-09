import { listRiskConditionsQuerySchema } from './list-risk-conditions.dto';

describe('listRiskConditionsQuerySchema', () => {
  it('accepts a single condition code', () => {
    const result = listRiskConditionsQuerySchema.safeParse({
      conditionCode: 'HYPERTENSION_HIGH_BP',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a comma-separated batch of condition codes', () => {
    const result = listRiskConditionsQuerySchema.safeParse({
      conditionCode: 'HYPERTENSION_HIGH_BP,SICKLE_CELL_TRAIT',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing conditionCode', () => {
    const result = listRiskConditionsQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an empty conditionCode', () => {
    const result = listRiskConditionsQuerySchema.safeParse({ conditionCode: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a batch larger than the max', () => {
    const codes = Array.from({ length: 101 }, (_, i) => `CODE_${i}`).join(',');
    const result = listRiskConditionsQuerySchema.safeParse({ conditionCode: codes });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = listRiskConditionsQuerySchema.safeParse({
      conditionCode: 'HYPERTENSION_HIGH_BP',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });
});
