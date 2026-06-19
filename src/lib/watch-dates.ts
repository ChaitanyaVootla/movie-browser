/**
 * Diary date helpers.
 *
 * Date-only diary values (imports, manual date picks) are stored at 12:00 UTC
 * so every common timezone offset renders the same calendar day — IST (+5:30)
 * being the audience-critical case (spec §4.2 watch_events).
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dateOnlyToUtc(dateStr: string): Date {
  const m = DATE_ONLY_RE.exec(dateStr);
  if (!m) throw new Error(`Invalid date-only string: ${dateStr}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
}

/** UTC calendar day key (YYYY-MM-DD) — streak math uses these. */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
