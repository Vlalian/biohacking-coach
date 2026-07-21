import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions } from '@/db/schema';
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
