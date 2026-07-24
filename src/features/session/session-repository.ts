import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, type NewSessionRow } from '@/db/schema';
import { addDays } from '@/lib/date';
import { toSession, type Session } from './session';

/**
 * The only place the app reads sessions out of Postgres.
 *
 * Scoped to one athlete by construction: the query filters on `athlete_id`, so
 * there is no shape of this call that returns another athlete's rows. That is
 * the athlete-scoping rule as a query, not a caller's responsibility to remember
 * (ADR 0006).
 *
 * Ordered by date then `day_order` so a day's sessions — a Double is two on one
 * date — come back in the order the calendar should show them.
 */
export async function getSessionsForAthlete(
  athleteId: string,
): Promise<Session[]> {
  const rows = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.athleteId, athleteId))
    .orderBy(asc(sessions.date), asc(sessions.dayOrder));

  return rows.map(toSession);
}

/**
 * Reads one athlete's sessions for a single Mon–Sun week, in calendar order.
 *
 * The Weekly Session reviews the week just lived (its Session Reflections and
 * skips), so it needs exactly that window. Scoped to the athlete by construction,
 * like {@link getSessionsForAthlete}.
 */
export async function getSessionsForWeek(
  athleteId: string,
  weekStartKey: string,
): Promise<Session[]> {
  const rows = await getDb()
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.athleteId, athleteId),
        gte(sessions.date, weekStartKey),
        lte(sessions.date, addDays(weekStartKey, 6)),
      ),
    )
    .orderBy(asc(sessions.date), asc(sessions.dayOrder));

  return rows.map(toSession);
}

/**
 * Replaces the coach-planned sessions of one week with a freshly agreed Week
 * Plan, atomically.
 *
 * Only `origin = 'coach'` rows in the target week are cleared — a completed
 * session the athlete already rated, a Garmin import, or a Head Coach's
 * prescription is never touched, so re-running the Weekly Session cannot erase
 * what actually happened. Delete and insert land in one `db.batch` so a failure
 * can never leave the week half-written. An empty plan (all Rest) clears the
 * week's coach sessions and inserts nothing.
 */
export async function replaceCoachPlanForWeek(
  athleteId: string,
  weekStartKey: string,
  rows: NewSessionRow[],
): Promise<void> {
  const db = getDb();
  const weekEndKey = addDays(weekStartKey, 6);

  const clear = db
    .delete(sessions)
    .where(
      and(
        eq(sessions.athleteId, athleteId),
        eq(sessions.origin, 'coach'),
        gte(sessions.date, weekStartKey),
        lte(sessions.date, weekEndKey),
      ),
    );

  if (rows.length === 0) {
    await clear;
    return;
  }

  await db.batch([clear, db.insert(sessions).values(rows)]);
}
