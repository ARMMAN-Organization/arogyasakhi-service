import { byIdsQuerySchema, parseIdsParam } from './by-ids-query.dto';

describe('byIdsQuerySchema', () => {
  it('accepts a comma-separated ids string', () => {
    expect(byIdsQuerySchema.safeParse({ ids: 'a,b,c' }).success).toBe(true);
  });

  it('rejects an empty ids string', () => {
    expect(byIdsQuerySchema.safeParse({ ids: '' }).success).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(byIdsQuerySchema.safeParse({ ids: 'a', extra: 'x' }).success).toBe(false);
  });
});

describe('parseIdsParam', () => {
  it('splits and trims a comma-separated list', () => {
    expect(parseIdsParam('a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('filters out empty entries from trailing/duplicate commas', () => {
    expect(parseIdsParam('a,,b,')).toEqual(['a', 'b']);
  });
});
