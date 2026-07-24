import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { athlete } from '@/db/schema';
import { toAthlete, type Athlete } from './athlete';

/**
 * The only place the app reads athletes out of Postgres.
 *
 * "The current athlete" is the one a signed-in user owns: the page resolves the
 * session to a user id and asks for that athlete (slice 02, replacing slice 01's
 * "the single seeded row"). Because callers depend on this function and the
 * domain type rather than on the row, widening what an athlete is stays a change
 * to this file.
 *
 * Returns undefined when no athlete is linked to the user — the page treats that
 * as "signed in but unprovisioned" rather than crashing. In normal operation the
 * signup hook mints the row, so this is the seam being defensive, not a path a
 * real user reaches.
 */
export async function getAthleteByUserId(
  userId: string,
): Promise<Athlete | undefined> {
  const rows = await getDb()
    .select()
    .from(athlete)
    .where(eq(athlete.userId, userId))
    .limit(1);

  return rows[0] ? toAthlete(rows[0]) : undefined;
}

/**
 * Persists the athlete's Information View layout (favorites + range).
 *
 * The value arrives validated — `saveLayout` in the information-view feature is
 * the only caller and owns what a legal layout is. This is the write seam, kept
 * with the other athlete-row access so the table has one owner.
 */
export async function updateInformationViewLayout(
  athleteId: string,
  layout: { favorites: string[]; range: string },
): Promise<void> {
  await getDb()
    .update(athlete)
    .set({ informationViewLayout: layout, updatedAt: new Date() })
    .where(eq(athlete.id, athleteId));
}
