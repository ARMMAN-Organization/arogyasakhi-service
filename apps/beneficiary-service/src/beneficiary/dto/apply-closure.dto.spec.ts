import { applyClosureSchema } from './apply-closure.dto';

describe('applyClosureSchema', () => {
  it('accepts a valid reasonCode', () => {
    expect(applyClosureSchema.safeParse({ reasonCode: 'MEDICAL' }).success).toBe(true);
  });

  it('rejects a missing reasonCode', () => {
    expect(applyClosureSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty reasonCode', () => {
    expect(applyClosureSchema.safeParse({ reasonCode: '' }).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    const result = applyClosureSchema.safeParse({ reasonCode: 'MEDICAL', extra: 'x' });
    expect(result.success).toBe(false);
  });
});
