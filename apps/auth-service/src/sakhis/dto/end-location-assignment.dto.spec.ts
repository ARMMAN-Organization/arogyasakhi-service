import { endLocationAssignmentSchema } from './end-location-assignment.dto';

describe('endLocationAssignmentSchema', () => {
  it('accepts an empty payload (defaults to today, applied in the service)', () => {
    expect(endLocationAssignmentSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a valid effectiveTo date', () => {
    const result = endLocationAssignmentSchema.safeParse({ effectiveTo: '2026-06-01' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.effectiveTo).toEqual(new Date('2026-06-01'));
    }
  });

  it('coerces an explicit effectiveTo: null to null rather than the Unix epoch', () => {
    const result = endLocationAssignmentSchema.safeParse({ effectiveTo: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.effectiveTo).toBeNull();
    }
  });

  it('rejects an invalid date string', () => {
    expect(endLocationAssignmentSchema.safeParse({ effectiveTo: 'not-a-date' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown field', () => {
    expect(endLocationAssignmentSchema.safeParse({ extra: 'x' }).success).toBe(false);
  });
});
