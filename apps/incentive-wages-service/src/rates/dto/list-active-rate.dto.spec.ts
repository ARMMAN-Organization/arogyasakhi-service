import { listActiveRateQuerySchema } from './list-active-rate.dto';

describe('listActiveRateQuerySchema', () => {
  it('accepts a minimal query with only rateType', () => {
    expect(listActiveRateQuerySchema.safeParse({ rateType: 'REFERRAL' }).success).toBe(true);
  });

  it('accepts referralType, geographyUnitId, and asOf', () => {
    const result = listActiveRateQuerySchema.safeParse({
      rateType: 'REFERRAL',
      referralType: 'ACCOMPANIED',
      geographyUnitId: '11111111-1111-1111-1111-111111111111',
      asOf: '2026-08-07',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid rateType', () => {
    expect(listActiveRateQuerySchema.safeParse({ rateType: 'BOGUS' }).success).toBe(false);
  });

  it('rejects an invalid referralType', () => {
    const result = listActiveRateQuerySchema.safeParse({
      rateType: 'REFERRAL',
      referralType: 'BOGUS',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing rateType', () => {
    expect(listActiveRateQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    const result = listActiveRateQuerySchema.safeParse({ rateType: 'REFERRAL', extra: 'x' });
    expect(result.success).toBe(false);
  });
});
