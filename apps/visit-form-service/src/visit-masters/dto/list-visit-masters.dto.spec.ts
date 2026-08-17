import { listVisitMastersQuerySchema } from './list-visit-masters.dto';

describe('listVisitMastersQuerySchema', () => {
  it('accepts a single visit code', () => {
    const result = listVisitMastersQuerySchema.safeParse({ visitCode: 'ANC1' });
    expect(result.success).toBe(true);
  });

  it('accepts a comma-separated batch of visit codes', () => {
    const result = listVisitMastersQuerySchema.safeParse({ visitCode: 'ANC1,PP3,INC_HR' });
    expect(result.success).toBe(true);
  });

  it('accepts a missing visitCode (requests all active visit masters)', () => {
    const result = listVisitMastersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects an empty visitCode', () => {
    const result = listVisitMastersQuerySchema.safeParse({ visitCode: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a batch larger than the max', () => {
    const codes = Array.from({ length: 101 }, (_, i) => `CODE_${i}`).join(',');
    const result = listVisitMastersQuerySchema.safeParse({ visitCode: codes });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = listVisitMastersQuerySchema.safeParse({ visitCode: 'ANC1', extra: 'nope' });
    expect(result.success).toBe(false);
  });
});
