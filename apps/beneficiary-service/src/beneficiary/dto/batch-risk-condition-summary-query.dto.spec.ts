import { batchRiskConditionSummaryQuerySchema } from './batch-risk-condition-summary-query.dto';

describe('batchRiskConditionSummaryQuerySchema', () => {
  it('accepts a single beneficiaryId', () => {
    const result = batchRiskConditionSummaryQuerySchema.safeParse({ beneficiaryIds: 'b1' });
    expect(result.success).toBe(true);
  });

  it('accepts a comma-separated list of beneficiaryIds as a plain string', () => {
    const result = batchRiskConditionSummaryQuerySchema.safeParse({
      beneficiaryIds: 'b1,b2,b3',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing beneficiaryIds param', () => {
    const result = batchRiskConditionSummaryQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an empty beneficiaryIds string', () => {
    const result = batchRiskConditionSummaryQuerySchema.safeParse({ beneficiaryIds: '' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = batchRiskConditionSummaryQuerySchema.safeParse({
      beneficiaryIds: 'b1',
      unexpectedField: 'nope',
    });
    expect(result.success).toBe(false);
  });
});
