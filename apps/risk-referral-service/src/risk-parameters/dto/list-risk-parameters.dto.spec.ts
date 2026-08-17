import { listRiskParametersQuerySchema } from './list-risk-parameters.dto';

describe('listRiskParametersQuerySchema', () => {
  it('accepts a single parameter code', () => {
    const result = listRiskParametersQuerySchema.safeParse({
      parameterCode: 'SYSTOLIC_BP',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a comma-separated batch of parameter codes', () => {
    const result = listRiskParametersQuerySchema.safeParse({
      parameterCode: 'SYSTOLIC_BP,HEMOGLOBIN',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a missing parameterCode (requests all active parameters)', () => {
    const result = listRiskParametersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects an empty parameterCode', () => {
    const result = listRiskParametersQuerySchema.safeParse({ parameterCode: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a batch larger than the max', () => {
    const codes = Array.from({ length: 101 }, (_, i) => `CODE_${i}`).join(',');
    const result = listRiskParametersQuerySchema.safeParse({ parameterCode: codes });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = listRiskParametersQuerySchema.safeParse({
      parameterCode: 'SYSTOLIC_BP',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });
});
