import { getDb } from '@/db';
import { athlete, type Athlete } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * The only place the app reads athletes out of Postgres.
 *
 * Slice 01 has no login, so "the athlete" means the first row — the one the
 * seed script creates. Slice 02 replaces this with a lookup by the signed-in
 * user, and this seam is what makes that a one-file change rather than a hunt
 * through components.
 */
export async function getFirstAthlete(): Promise<Athlete | undefined> {
  const rows = await getDb().select().from(athlete).limit(1);
  return rows[0];
}

export async function getAthleteById(id: string): Promise<Athlete | undefined> {
  const rows = await getDb().select().from(athlete).where(eq(athlete.id, id)).limit(1);
  return rows[0];
}
