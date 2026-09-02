import { byIdsDetailQuerySchema, parseAndValidateIdsParam } from './by-ids-detail-query.dto';

describe('byIdsDetailQuerySchema', () => {
  it('accepts a single id', () => {
    const result = byIdsDetailQuerySchema.safeParse({
      ids: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a comma-separated list of ids as a plain string', () => {
    const result = byIdsDetailQuerySchema.safeParse({
      ids: '11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing ids param', () => {
    const result = byIdsDetailQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an empty ids string', () => {
    const result = byIdsDetailQuerySchema.safeParse({ ids: '' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = byIdsDetailQuerySchema.safeParse({
      ids: '11111111-1111-1111-1111-111111111111',
      unexpectedField: 'nope',
    });
    expect(result.success).toBe(false);
  });
});

describe('parseAndValidateIdsParam', () => {
  it('splits a comma-separated list, trimming each entry', () => {
    const result = parseAndValidateIdsParam(
      ' 11111111-1111-1111-1111-111111111111 , 22222222-2222-2222-2222-222222222222 ',
    );
    expect(result).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]);
  });

  it('preserves a duplicate id in the list (dedup, if any, happens downstream)', () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const result = parseAndValidateIdsParam(`${id},${id}`);
    expect(result).toEqual([id, id]);
  });

  it('drops empty entries from a trailing/doubled comma', () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const result = parseAndValidateIdsParam(`${id},,`);
    expect(result).toEqual([id]);
  });

  it('throws badRequest on a non-uuid entry', () => {
    expect(() =>
      parseAndValidateIdsParam('11111111-1111-1111-1111-111111111111,not-a-uuid'),
    ).toThrow(/not a valid uuid/);
  });
});
