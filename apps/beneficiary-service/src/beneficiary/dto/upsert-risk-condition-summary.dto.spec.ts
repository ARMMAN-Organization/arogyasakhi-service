import { upsertRiskConditionSummarySchema } from './upsert-risk-condition-summary.dto';

const RISK_CONDITION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const baseInput = {
  riskConditionId: RISK_CONDITION_ID,
  phase: 'REGISTRATION' as const,
  assessedAt: new Date('2026-01-01').toISOString(),
  isReferralTrigger: false,
  isHrVisitTrigger: false,
};

describe('upsertRiskConditionSummarySchema', () => {
  it('accepts a payload with grade and gradeRank omitted', () => {
    const result = upsertRiskConditionSummarySchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it('accepts a payload with grade and gradeRank present', () => {
    const result = upsertRiskConditionSummarySchema.safeParse({
      ...baseInput,
      grade: 'HIGH',
      gradeRank: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty-string grade when provided', () => {
    const result = upsertRiskConditionSummarySchema.safeParse({ ...baseInput, grade: '' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = upsertRiskConditionSummarySchema.safeParse({
      ...baseInput,
      unexpectedField: 'nope',
    });
    expect(result.success).toBe(false);
  });
});
