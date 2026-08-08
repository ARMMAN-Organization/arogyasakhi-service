import { applyLmpChangeSchema } from './apply-lmp-change.dto';

describe('applyLmpChangeSchema', () => {
  it('accepts a valid lmpDate', () => {
    expect(applyLmpChangeSchema.safeParse({ lmpDate: '2026-06-15' }).success).toBe(true);
  });

  it('rejects a missing lmpDate', () => {
    expect(applyLmpChangeSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an invalid date string', () => {
    expect(applyLmpChangeSchema.safeParse({ lmpDate: 'not-a-date' }).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    const result = applyLmpChangeSchema.safeParse({ lmpDate: '2026-06-15', extra: 'x' });
    expect(result.success).toBe(false);
  });
});
