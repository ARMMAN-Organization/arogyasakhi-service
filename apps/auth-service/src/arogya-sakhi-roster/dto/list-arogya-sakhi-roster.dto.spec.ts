import { listArogyaSakhiRosterQuerySchema } from './list-arogya-sakhi-roster.dto';

describe('listArogyaSakhiRosterQuerySchema', () => {
  it('accepts a valid projectId', () => {
    const result = listArogyaSakhiRosterQuerySchema.safeParse({
      projectId: '70ca545d-298a-4c02-bba2-d5c4c9bb9acd',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing projectId', () => {
    const result = listArogyaSakhiRosterQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid projectId', () => {
    const result = listArogyaSakhiRosterQuerySchema.safeParse({ projectId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown query field', () => {
    const result = listArogyaSakhiRosterQuerySchema.safeParse({
      projectId: '70ca545d-298a-4c02-bba2-d5c4c9bb9acd',
      extra: '1',
    });
    expect(result.success).toBe(false);
  });
});
