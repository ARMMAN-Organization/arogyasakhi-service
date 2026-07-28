import { getMasterDataDeltasQuerySchema } from './get-master-data-deltas.dto';

describe('getMasterDataDeltasQuerySchema', () => {
  it('accepts an omitted since (full snapshot)', () => {
    const result = getMasterDataDeltasQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.since).toBeUndefined();
  });

  it('accepts an empty-string since (the controller normalizes it to omitted)', () => {
    const result = getMasterDataDeltasQuerySchema.safeParse({ since: '' });
    expect(result.success).toBe(true);
  });

  it('accepts a valid ISO-8601 datetime', () => {
    const result = getMasterDataDeltasQuerySchema.safeParse({ since: '2026-01-01T00:00:00.000Z' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.since).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects a non-date string', () => {
    const result = getMasterDataDeltasQuerySchema.safeParse({ since: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('accepts a date-only string (JS Date.parse accepts it; the repository still filters correctly)', () => {
    const result = getMasterDataDeltasQuerySchema.safeParse({ since: '2026-01-01' });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown query field', () => {
    const result = getMasterDataDeltasQuerySchema.safeParse({
      since: '2026-01-01T00:00:00.000Z',
      extra: '1',
    });
    expect(result.success).toBe(false);
  });
});
