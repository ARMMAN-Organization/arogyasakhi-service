import { updateLocationAssignmentSchema } from './update-location-assignment.dto';

const VILLAGE_ID = '11111111-1111-1111-1111-111111111111';
const PADA_ID = '22222222-2222-2222-2222-222222222222';

describe('updateLocationAssignmentSchema', () => {
  it('accepts an empty payload (no fields touched)', () => {
    expect(updateLocationAssignmentSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial update of just padaId', () => {
    expect(updateLocationAssignmentSchema.safeParse({ padaId: PADA_ID }).success).toBe(true);
  });

  it('accepts padaId: null (clearing the pada)', () => {
    const result = updateLocationAssignmentSchema.safeParse({ padaId: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.padaId).toBeNull();
    }
  });

  it('accepts effectiveTo: null (open-ended) without coercing to the Unix epoch', () => {
    const result = updateLocationAssignmentSchema.safeParse({ effectiveTo: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.effectiveTo).toBeNull();
    }
  });

  it('rejects effectiveFrom: null — effectiveFrom has no clear semantics', () => {
    expect(updateLocationAssignmentSchema.safeParse({ effectiveFrom: null }).success).toBe(false);
  });

  it('accepts a valid effectiveFrom date', () => {
    const result = updateLocationAssignmentSchema.safeParse({ effectiveFrom: '2026-01-01' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.effectiveFrom).toEqual(new Date('2026-01-01'));
    }
  });

  it('rejects a non-uuid villageId', () => {
    expect(updateLocationAssignmentSchema.safeParse({ villageId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown field (e.g. projectId, not editable)', () => {
    expect(
      updateLocationAssignmentSchema.safeParse({ villageId: VILLAGE_ID, projectId: 'sneaky' })
        .success,
    ).toBe(false);
  });
});
