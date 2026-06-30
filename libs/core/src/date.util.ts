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
