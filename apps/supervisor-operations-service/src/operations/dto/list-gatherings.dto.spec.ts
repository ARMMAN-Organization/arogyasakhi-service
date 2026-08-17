import { listGatheringsQuerySchema } from './list-gatherings.dto';

describe('listGatheringsQuerySchema', () => {
  it('accepts an empty query (sakhiId omitted)', () => {
    const result = listGatheringsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts a valid sakhiId', () => {
    const result = listGatheringsQuerySchema.safeParse({
      sakhiId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid sakhiId', () => {
    const result = listGatheringsQuerySchema.safeParse({ sakhiId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown field (.strict())', () => {
    const result = listGatheringsQuerySchema.safeParse({ extra: 'nope' });
    expect(result.success).toBe(false);
  });
});
