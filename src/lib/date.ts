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
 * True only for a canonical 'YYYY-MM-DD' that names a real calendar day.
 *
 * The Move rules compare date keys as strings, and the seam trusts that shape;
 * a target date arriving from the client is untrusted until this passes. Rejects
 * both malformed strings ('2026-7-5') and impossible days ('2026-02-30').
 */
export function isValidDateKey(value: string): boolean {
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
