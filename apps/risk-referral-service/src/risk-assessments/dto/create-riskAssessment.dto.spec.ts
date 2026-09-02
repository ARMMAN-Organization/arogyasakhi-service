import { createRiskAssessmentSchema } from './create-riskAssessment.dto';

const validBody = {
  beneficiaryId: '11111111-1111-1111-1111-111111111111',
  visitId: '22222222-2222-2222-2222-222222222222',
  submissionId: '33333333-3333-3333-3333-333333333333',
  ruleSetId: '44444444-4444-4444-4444-444444444444',
  riskPhase: 'ANC',
  answers: { systolicBp: 145 },
};

describe('createRiskAssessmentSchema', () => {
  it('accepts a request with actualCompletionDate omitted (backward compatible)', () => {
    const result = createRiskAssessmentSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it('accepts an optional actualCompletionDate as a date-only string', () => {
    const result = createRiskAssessmentSchema.safeParse({
      ...validBody,
      actualCompletionDate: '2026-09-01',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-date-only actualCompletionDate string', () => {
    const result = createRiskAssessmentSchema.safeParse({
      ...validBody,
      actualCompletionDate: '2026-09-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
