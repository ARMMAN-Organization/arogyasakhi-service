import { createLocationAssignmentSchema } from './create-location-assignment.dto';

const VILLAGE_ID = '11111111-1111-1111-1111-111111111111';
const PADA_ID = '22222222-2222-2222-2222-222222222222';

describe('createLocationAssignmentSchema', () => {
  it('accepts a minimal valid payload (no padaId/effectiveTo)', () => {
    const result = createLocationAssignmentSchema.safeParse({
      villageId: VILLAGE_ID,
      effectiveFrom: '2026-01-01',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a full payload including padaId and effectiveTo', () => {
    const result = createLocationAssignmentSchema.safeParse({
      villageId: VILLAGE_ID,
      padaId: PADA_ID,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-06-01',
    });
    expect(result.success).toBe(true);
  });

  it('coerces an explicit effectiveTo: null to null rather than the Unix epoch', () => {
    const result = createLocationAssignmentSchema.safeParse({
      villageId: VILLAGE_ID,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.effectiveTo).toBeNull();
    }
  });

  it('rejects a missing villageId', () => {
    expect(createLocationAssignmentSchema.safeParse({ effectiveFrom: '2026-01-01' }).success).toBe(
      false,
    );
  });

  it('rejects a non-uuid villageId', () => {
    expect(
      createLocationAssignmentSchema.safeParse({
        villageId: 'not-a-uuid',
        effectiveFrom: '2026-01-01',
      }).success,
    ).toBe(false);
  });

  it('rejects a missing effectiveFrom', () => {
    expect(createLocationAssignmentSchema.safeParse({ villageId: VILLAGE_ID }).success).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(
      createLocationAssignmentSchema.safeParse({
        villageId: VILLAGE_ID,
        effectiveFrom: '2026-01-01',
        projectId: 'sneaky',
      }).success,
    ).toBe(false);
  });
});
