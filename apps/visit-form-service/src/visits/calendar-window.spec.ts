import { currentMonthWindow, currentWeekWindow } from './calendar-window';

describe('currentWeekWindow', () => {
  it("anchors a mid-week Wednesday to that week's Monday through the following Monday", () => {
    const wednesday = new Date('2026-08-19T14:30:00.000Z');

    const { from, to } = currentWeekWindow(wednesday);

    expect(from.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });

  it('treats a Monday itself as the start of its own week', () => {
    const monday = new Date('2026-08-17T00:00:00.000Z');

    const { from, to } = currentWeekWindow(monday);

    expect(from.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });

  it('rolls a Sunday back to the preceding Monday, not forward', () => {
    const sunday = new Date('2026-08-23T23:59:59.999Z');

    const { from, to } = currentWeekWindow(sunday);

    expect(from.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });
});

describe('currentMonthWindow', () => {
  it('anchors a mid-month date to the 1st of that month through the 1st of the next', () => {
    const midMonth = new Date('2026-08-19T14:30:00.000Z');

    const { from, to } = currentMonthWindow(midMonth);

    expect(from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('rolls December into January of the following year', () => {
    const decemberDate = new Date('2026-12-31T23:59:59.999Z');

    const { from, to } = currentMonthWindow(decemberDate);

    expect(from.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('handles a leap-year February correctly', () => {
    const leapFebDate = new Date('2028-02-29T10:00:00.000Z');

    const { from, to } = currentMonthWindow(leapFebDate);

    expect(from.toISOString()).toBe('2028-02-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2028-03-01T00:00:00.000Z');
  });
});
