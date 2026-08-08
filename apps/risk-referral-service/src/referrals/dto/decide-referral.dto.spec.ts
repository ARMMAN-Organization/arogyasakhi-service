import { decideReferralSchema } from './decide-referral.dto';

describe('decideReferralSchema', () => {
  it('accepts LAPSE', () => {
    expect(decideReferralSchema.safeParse({ decision: 'LAPSE' }).success).toBe(true);
  });

  it('accepts REFILL', () => {
    expect(decideReferralSchema.safeParse({ decision: 'REFILL' }).success).toBe(true);
  });

  it('accepts COMPLETE', () => {
    expect(decideReferralSchema.safeParse({ decision: 'COMPLETE' }).success).toBe(true);
  });

  it('rejects an invalid decision value', () => {
    expect(decideReferralSchema.safeParse({ decision: 'APPROVE' }).success).toBe(false);
  });

  it('rejects a missing decision', () => {
    expect(decideReferralSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    const result = decideReferralSchema.safeParse({ decision: 'LAPSE', extra: 'x' });
    expect(result.success).toBe(false);
  });
});
