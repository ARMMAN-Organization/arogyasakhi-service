/** A half-open UTC instant range: `from` inclusive, `to` exclusive. */
export interface CalendarWindow {
  from: Date;
  to: Date;
}

/**
 * Monday-start UTC calendar week containing `now` — e.g. for a Wednesday,
 * `from` is that week's Monday 00:00:00.000 UTC and `to` is the following
 * Monday 00:00:00.000 UTC (exclusive). `Date.getUTCDay()` returns 0=Sunday..
 * 6=Saturday, so `(day + 6) % 7` gives the offset back to Monday.
 */
export function currentWeekWindow(now: Date): CalendarWindow {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mondayOffset = (from.getUTCDay() + 6) % 7;
  from.setUTCDate(from.getUTCDate() - mondayOffset);

  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 7);

  return { from, to };
}

/**
 * Calendar-month UTC window containing `now` — `from` is the 1st of that
 * month at 00:00:00.000 UTC, `to` is the 1st of the next month (exclusive).
 */
export function currentMonthWindow(now: Date): CalendarWindow {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to };
}
