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
