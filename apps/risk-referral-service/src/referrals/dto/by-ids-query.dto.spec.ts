import { byIdsQuerySchema, MAX_BATCH_BY_IDS } from './by-ids-query.dto';

describe('byIdsQuerySchema', () => {
  it('accepts a single uuid', () => {
    expect(
      byIdsQuerySchema.safeParse({ ids: '11111111-1111-1111-1111-111111111111' }).success,
    ).toBe(true);
  });

  it('accepts a comma-separated list of uuids', () => {
    const result = byIdsQuerySchema.safeParse({
      ids: '11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(byIdsQuerySchema.safeParse({ ids: '' }).success).toBe(false);
  });

  it('rejects a non-uuid token in the list', () => {
    expect(
      byIdsQuerySchema.safeParse({
        ids: '11111111-1111-1111-1111-111111111111,not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it(`rejects more than ${MAX_BATCH_BY_IDS} ids`, () => {
    const ids = Array.from(
      { length: MAX_BATCH_BY_IDS + 1 },
      () => '11111111-1111-1111-1111-111111111111',
    ).join(',');
    expect(byIdsQuerySchema.safeParse({ ids }).success).toBe(false);
  });

  it('rejects a missing ids param', () => {
    expect(byIdsQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    expect(
      byIdsQuerySchema.safeParse({
        ids: '11111111-1111-1111-1111-111111111111',
        extraField: 'x',
      }).success,
    ).toBe(false);
  });
});
