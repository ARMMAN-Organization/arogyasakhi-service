import { listRiskAssessmentsQuerySchema } from './list-riskAssessments.dto';

const BENEFICIARY_ID = '11111111-1111-1111-1111-111111111111';
const VISIT_ID_1 = '22222222-2222-2222-2222-222222222222';
const VISIT_ID_2 = '33333333-3333-3333-3333-333333333333';

describe('listRiskAssessmentsQuerySchema', () => {
  it('accepts a single visit id', () => {
    const result = listRiskAssessmentsQuerySchema.safeParse({
      beneficiaryId: BENEFICIARY_ID,
      visitIds: VISIT_ID_1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a comma-separated batch of visit ids', () => {
    const result = listRiskAssessmentsQuerySchema.safeParse({
      beneficiaryId: BENEFICIARY_ID,
      visitIds: `${VISIT_ID_1},${VISIT_ID_2}`,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing beneficiaryId', () => {
    const result = listRiskAssessmentsQuerySchema.safeParse({ visitIds: VISIT_ID_1 });
    expect(result.success).toBe(false);
  });

  it('rejects a missing visitIds', () => {
    const result = listRiskAssessmentsQuerySchema.safeParse({ beneficiaryId: BENEFICIARY_ID });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid beneficiaryId', () => {
    const result = listRiskAssessmentsQuerySchema.safeParse({
      beneficiaryId: 'not-a-uuid',
      visitIds: VISIT_ID_1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a visitIds batch containing a non-uuid segment', () => {
    const result = listRiskAssessmentsQuerySchema.safeParse({
      beneficiaryId: BENEFICIARY_ID,
      visitIds: `${VISIT_ID_1},not-a-uuid`,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a visitIds batch larger than the max', () => {
    const visitIds = Array.from({ length: 101 }, () => VISIT_ID_1).join(',');
    const result = listRiskAssessmentsQuerySchema.safeParse({
      beneficiaryId: BENEFICIARY_ID,
      visitIds,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = listRiskAssessmentsQuerySchema.safeParse({
      beneficiaryId: BENEFICIARY_ID,
      visitIds: VISIT_ID_1,
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });
});
