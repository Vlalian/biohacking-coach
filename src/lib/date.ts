/**
 * 'YYYY-MM-DD' for a date in local terms.
 *
 * This is the string shape of the `sessions.date` column, so the calendar and
 * the seed agree on how a Date becomes a day key. Local, not UTC: a session is
 * on the day the athlete lived it, not the day it was in Greenwich.
 */
export function dateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Today's day key, the one place the app asks what day it is.
 *
 * Every server-side "today" — the calendar's highlighted cell, the Move rules,
 * the Weekly Session's week, the Coach's planning window — routes through here
 * so that a test can pin the date. `COACH_TODAY=YYYY-MM-DD` does that, outside
 * production only: the full-page snapshots (frontend-quality/05) would
 * otherwise change every midnight, and the calendar would have to stay
 * masked. In production the variable is ignored even if set, so a stray
 * deploy-time value can never freeze real athletes on one day.
 */
export function today(): string {
  const pinned = process.env.COACH_TODAY;
  if (pinned && process.env.NODE_ENV !== 'production' && isValidDateKey(pinned)) {
    return pinned;
  }
  return dateKey(new Date());
}

/**
 * True only for a canonical 'YYYY-MM-DD' that names a real calendar day.
 *
 * The Move rules compare date keys as strings, and the seam trusts that shape;
 * a target date arriving from the client is untrusted until this passes. Rejects
 * both malformed strings ('2026-7-5') and impossible days ('2026-02-30').
 */
export function isValidDateKey(value: string): boolean {
  // Stryker disable next-line ConditionalExpression,Regex — the shape check is
  // a readable first refusal, not the load-bearing one: V8 parses no string
  // that fails it into a Date whose key round-trips to the same string, so no
  // input distinguishes the guard from its absence (frontend-quality/06).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && dateKey(parsed) === value;
}

/** Adds (or subtracts) whole days to a 'YYYY-MM-DD' key, returning a key. */
export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/**
 * The Monday of the week a day belongs to, as a 'YYYY-MM-DD' key.
 *
 * The Mon–Sun week is the planning unit (ADR 0002): a Session Move is legal only
 * within it, so "same week" is "same weekStartOf".
 */
export function weekStartOf(key: string): string {
  const day = new Date(`${key}T00:00:00`).getDay(); // 0 = Sunday
  return addDays(key, -(day === 0 ? 6 : day - 1));
}

/**
 * A date key as a full, localised date — "Wednesday 15 July".
 *
 * Parsed and formatted in UTC deliberately: a date key is a calendar day, not
 * an instant, and letting the runtime apply a local offset shifts it by one
 * day for anyone west of Greenwich.
 */
export function formatFullDate(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${key}T00:00:00Z`));
}
