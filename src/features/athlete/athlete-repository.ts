import { getDb } from '@/db';
import { athlete } from '@/db/schema';
import { toAthlete, type Athlete } from './athlete';

/**
 * The only place the app reads athletes out of Postgres.
 *
 * Slice 01 has no login, so "the current athlete" means the single seeded row.
 * Slice 02 replaces the query with a lookup by the signed-in user; because
 * callers depend on this function and the domain type rather than on the row,
 * that stays a change to this file.
 */
export async function getCurrentAthlete(): Promise<Athlete | undefined> {
  const rows = await getDb().select().from(athlete).limit(1);
  return rows[0] ? toAthlete(rows[0]) : undefined;
}
