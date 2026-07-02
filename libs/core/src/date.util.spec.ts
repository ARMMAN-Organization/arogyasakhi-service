import { addDays, diffInDays } from './date.util';

describe('date.util', () => {
  it('addDays adds whole days', () => {
    expect(addDays(new Date('2026-01-01T00:00:00Z'), 5).toISOString()).toBe('2026-01-06T00:00:00.000Z');
  });
  it('diffInDays computes whole-day difference', () => {
    expect(diffInDays(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-06T00:00:00Z'))).toBe(5);
  });
});
