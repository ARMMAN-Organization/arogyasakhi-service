import { createVisitScheduleBulkSchema } from './create-visit-schedule-bulk.dto';

describe('createVisitScheduleBulkSchema', () => {
  const validRow = {
    localScheduleUuid: '3f9a1234-0000-0000-0000-000000000000',
    visitCode: 'ANC1',
    visitType: 'ANC',
    sequenceNo: 1,
    scheduledDate: '2026-08-10',
    windowStartDate: '2026-08-10',
    windowEndDate: '2026-08-15',
    anchorType: 'REGISTRATION',
    anchorVisitLocalUuid: null,
  };

  const base = {
    beneficiaryId: '11111111-1111-1111-1111-111111111111',
    generatedByRuleVersionId: '22222222-2222-2222-2222-222222222222',
    schedules: [validRow],
  };

  it('accepts a well-formed single-row batch (M1)', () => {
    const result = createVisitScheduleBulkSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts a well-formed HR row with a non-null anchorVisitLocalUuid', () => {
    const result = createVisitScheduleBulkSchema.safeParse({
      ...base,
      schedules: [{ ...validRow, anchorVisitLocalUuid: 'sibling-local-uuid' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a full ISO datetime for scheduledDate instead of a date-only string (case 12)', () => {
    const result = createVisitScheduleBulkSchema.safeParse({
      ...base,
      schedules: [{ ...validRow, scheduledDate: '2026-08-10T00:00:00Z' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a full ISO datetime for windowStartDate', () => {
    const result = createVisitScheduleBulkSchema.safeParse({
      ...base,
      schedules: [{ ...validRow, windowStartDate: '2026-08-10T00:00:00Z' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects windowStartDate after windowEndDate (case 11)', () => {
    const result = createVisitScheduleBulkSchema.safeParse({
      ...base,
      schedules: [{ ...validRow, windowStartDate: '2026-08-20', windowEndDate: '2026-08-15' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts windowStartDate equal to windowEndDate (boundary, not an error)', () => {
    const result = createVisitScheduleBulkSchema.safeParse({
      ...base,
      schedules: [{ ...validRow, windowStartDate: '2026-08-15', windowEndDate: '2026-08-15' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown visitType enum value', () => {
    const result = createVisitScheduleBulkSchema.safeParse({
      ...base,
      schedules: [{ ...validRow, visitType: 'NOT_A_REAL_TYPE' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown anchorType enum value', () => {
    const result = createVisitScheduleBulkSchema.safeParse({
      ...base,
      schedules: [{ ...validRow, anchorType: 'NOT_A_REAL_ANCHOR' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid beneficiaryId', () => {
    const result = createVisitScheduleBulkSchema.safeParse({
      ...base,
      beneficiaryId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid generatedByRuleVersionId', () => {
    const result = createVisitScheduleBulkSchema.safeParse({
      ...base,
      generatedByRuleVersionId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty schedules array', () => {
    const result = createVisitScheduleBulkSchema.safeParse({ ...base, schedules: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown top-level field (.strict())', () => {
    const result = createVisitScheduleBulkSchema.safeParse({ ...base, extraField: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown field on a schedule row (.strict())', () => {
    const result = createVisitScheduleBulkSchema.safeParse({
      ...base,
      schedules: [{ ...validRow, extraField: 'nope' }],
    });
    expect(result.success).toBe(false);
  });

  it('does not cap schedules length at the schema level — 101 rows still parses (413 is enforced upstream, in the controller)', () => {
    const manyRows = Array.from({ length: 101 }, (_, i) => ({
      ...validRow,
      localScheduleUuid: `uuid-${i}`,
    }));
    const result = createVisitScheduleBulkSchema.safeParse({ ...base, schedules: manyRows });
    expect(result.success).toBe(true);
  });
});
