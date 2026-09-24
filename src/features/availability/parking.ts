import { sql, type SQL } from 'drizzle-orm';
import { sessions } from '@/db/schema';

/**
 * The parking rule's one statement of what happens to `parked_by_date` when a
 * session's day changes.
 *
 * `parked_by_date` names the day whose Unavailable Date parked the session, and
 * `clearUnavailableDate` restores only rows naming the day it clears. A parked
 * session can still be given a new day — the calendar refuses to drag one, but
 * the server is the authority and both the Session Move and the Head Coach's
 * edit write `date` without refusing — so the name has to follow the row, or
 * clearing neither the old day (`date` no longer matches) nor the new one
 * (`parked_by_date` does not) would restore it.
 *
 * A session-parked row (null) stays null. Decided in SQL over the column rather
 * than from a row read earlier: a day-park does not bump `version`, so a
 * compare-and-set would not notice one landing between the read and the write.
 *
 * The bound day is cast to `date` inside the statement. In a CASE Postgres has
 * no column to infer the parameter's type from — the other arm is a bare NULL —
 * so it resolved the text parameter as text and refused to assign it to a date
 * column (42804). Every Session Move on production threw on it
 * (showable-version/43, 2026-09-24).
 */
export function parkedByDateAfterMoveTo(date: string): SQL {
  return sql`CASE WHEN ${sessions.parkedByDate} IS NULL THEN NULL ELSE ${sql.param(date)}::date END`;
}
