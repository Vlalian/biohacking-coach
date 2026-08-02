import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { unavailableDates } from '@/db/schema';

/**
 * The only place the app reads an athlete's Unavailable Dates out of Postgres.
 *
 * Scoped to one athlete by construction: the query filters on `athlete_id`, so
 * no shape of this call returns another athlete's days (ADR 0006). Returned as a
 * sorted list of 'YYYY-MM-DD' keys — the shape the calendar renders the day
 * markers from, matching how `sessions.date` is keyed.
 */
export async function getUnavailableDates(
  athleteId: string,
): Promise<string[]> {
  const rows = await getDb()
    .select({ date: unavailableDates.date })
    .from(unavailableDates)
    .where(eq(unavailableDates.athleteId, athleteId))
    .orderBy(asc(unavailableDates.date));

  return rows.map((r) => r.date);
}
