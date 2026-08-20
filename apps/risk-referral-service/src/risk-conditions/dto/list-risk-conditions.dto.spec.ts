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

  it('accepts a missing conditionCode (requests all active conditions)', () => {
    const result = listRiskConditionsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
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

  const UUID_1 = '11111111-1111-1111-1111-111111111111';
  const UUID_2 = '22222222-2222-2222-2222-222222222222';

  it('accepts a single riskConditionId', () => {
    const result = listRiskConditionsQuerySchema.safeParse({ ids: UUID_1 });
    expect(result.success).toBe(true);
  });

  it('accepts a comma-separated batch of riskConditionIds', () => {
    const result = listRiskConditionsQuerySchema.safeParse({ ids: `${UUID_1},${UUID_2}` });
    expect(result.success).toBe(true);
  });

  it('rejects an ids batch containing a non-uuid segment', () => {
    const result = listRiskConditionsQuerySchema.safeParse({ ids: `${UUID_1},not-a-uuid` });
    expect(result.success).toBe(false);
  });

  it('rejects an ids batch larger than the max', () => {
    const ids = Array.from({ length: 101 }, () => UUID_1).join(',');
    const result = listRiskConditionsQuerySchema.safeParse({ ids });
    expect(result.success).toBe(false);
  });

  // Rejecting conditionCode+ids given together is enforced in
  // riskCondition.controller.ts, not this schema — see the schema's own
  // comment on why a whole-object .refine() isn't used here (it would break
  // zod-to-openapi's introspection and crash the service at boot). The
  // schema itself accepts both being present; it's a valid *shape*, just a
  // combination the controller chooses to reject as ambiguous.
  it('accepts conditionCode and ids given together at the schema level (rejection is a controller-level concern)', () => {
    const result = listRiskConditionsQuerySchema.safeParse({
      conditionCode: 'HYPERTENSION_HIGH_BP',
      ids: UUID_1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts neither conditionCode nor ids (requests all active conditions)', () => {
    const result = listRiskConditionsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
