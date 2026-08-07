const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Returns a new Date offset by the given number of whole days (UTC-safe). */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Whole-day difference (b - a), floored. */
export function diffInDays(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Midnight UTC of the given date's calendar day — the instant a `@db.Date`
 * column's coerced value represents. Normalizing "now" to this before a
 * diffInDays comparison avoids the bug where a same-day @db.Date value reads
 * as "in the past" for every instant after UTC midnight.
 */
export function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
