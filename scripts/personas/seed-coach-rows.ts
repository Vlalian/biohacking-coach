import { eq } from 'drizzle-orm';
import { getDb } from '../../src/db';
import { coach, coachingLink } from '../../src/db/schema';

/**
 * The coach rows the seed writes, and the Coaching Links that hang off them.
 *
 * Lifted out of `scripts/seed.ts` (code-health/24) for the same reason
 * `seed-personas.ts` was: that file calls `guardDatabase` and `seed()` at module
 * scope and ends in `process.exit`, so nothing can import it, so nothing could
 * test it. The dual-role writer sat there supplying a fixed primary key under a
 * conflict clause that guarded a different column, and a preview crashed on it
 * before anyone noticed.
 */

/**
 * The coach row for a user, created or found, and its id either way.
 *
 * No `id` is supplied: `coach.id` defaults to a random uuid and `coach.user_id`
 * is unique, so the user is what the row is claimed by and the row cannot
 * collide with one that already exists under a different user. The fallback is
 * for the case the conflict clause is there for — this user already has a row,
 * so the insert writes nothing and returns nothing.
 */
export async function ensureCoachRow(userId: string): Promise<string> {
  const db = getDb();
  const [insertedRow] = await db
    .insert(coach)
    .values({ userId })
    .onConflictDoNothing({ target: coach.userId })
    .returning({ id: coach.id });
  if (insertedRow) return insertedRow.id;

  const [existing] = await db.select({ id: coach.id }).from(coach).where(eq(coach.userId, userId)).limit(1);
  if (!existing) throw new Error(`Coach row missing for user ${userId} after insert.`);
  return existing.id;
}

/**
 * One active Coaching Link per athlete, idempotently. The partial unique index
 * guards the active pair, so `onConflictDoNothing` makes a re-seed a no-op
 * rather than a duplicate.
 */
export async function linkAthletes(coachId: string, athleteIds: readonly string[]): Promise<void> {
  const db = getDb();
  for (const athleteId of athleteIds) {
    await db.insert(coachingLink).values({ coachId, athleteId }).onConflictDoNothing();
  }
}
