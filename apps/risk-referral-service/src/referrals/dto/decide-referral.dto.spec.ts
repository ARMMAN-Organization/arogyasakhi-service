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

  it('accepts decisionNotes when present', () => {
    const result = decideReferralSchema.safeParse({
      decision: 'REFILL',
      decisionNotes: 'Beneficiary was unavailable, please retry next week.',
    });
    expect(result.success).toBe(true);
  });

  it('is valid without decisionNotes (optional)', () => {
    const result = decideReferralSchema.safeParse({ decision: 'LAPSE' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.decisionNotes).toBeUndefined();
    }
  });

  it('rejects an empty-string decisionNotes', () => {
    const result = decideReferralSchema.safeParse({ decision: 'LAPSE', decisionNotes: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a decisionNotes longer than 1000 characters', () => {
    const result = decideReferralSchema.safeParse({
      decision: 'LAPSE',
      decisionNotes: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('trims decisionNotes', () => {
    const result = decideReferralSchema.safeParse({
      decision: 'LAPSE',
      decisionNotes: '  padded  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.decisionNotes).toBe('padded');
    }
  });
});
