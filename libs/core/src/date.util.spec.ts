import { addDays, diffInDays, startOfUTCDay } from './date.util';

describe('date.util', () => {
  it('addDays adds whole days', () => {
    expect(addDays(new Date('2026-01-01T00:00:00Z'), 5).toISOString()).toBe(
      '2026-01-06T00:00:00.000Z',
    );
  });
  it('diffInDays computes whole-day difference', () => {
    expect(diffInDays(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-06T00:00:00Z'))).toBe(5);
  });

  describe('startOfUTCDay', () => {
    it('returns midnight UTC of the same calendar day', () => {
      expect(startOfUTCDay(new Date('2026-08-07T23:59:00Z')).toISOString()).toBe(
        '2026-08-07T00:00:00.000Z',
      );
    });

    it('is a no-op when already at midnight UTC', () => {
      expect(startOfUTCDay(new Date('2026-08-07T00:00:00Z')).toISOString()).toBe(
        '2026-08-07T00:00:00.000Z',
      );
    });

    it('lets a same-day @db.Date value compare as "today" late in the day', () => {
      const now = new Date('2026-08-07T23:59:00Z');
      const eventDateToday = new Date('2026-08-07T00:00:00Z');
      expect(diffInDays(startOfUTCDay(now), eventDateToday)).toBe(0);
    });
  });
});
