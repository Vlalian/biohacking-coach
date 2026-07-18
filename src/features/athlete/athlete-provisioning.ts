// Relative imports, not @/: this module is reached from auth.ts, which the seed
// loads under tsx where the alias does not resolve.
import { getDb } from '../../db';
import { athlete } from '../../db/schema';

/**
 * Mints the athlete row a new user owns — the write half of the user↔athlete
 * seam, called from better-auth's user-create hook (slice 02).
 *
 * `syntheticLabel` is null: a real athlete's name is `user.name`. The insert is
 * guarded so a retried signup for the same user cannot mint a second row; the
 * unique constraint on `athlete.user_id` is the structural backstop, and this
 * keeps the provisioning itself idempotent rather than relying on the constraint
 * to throw.
 */
export async function provisionAthlete(userId: string): Promise<void> {
  await getDb()
    .insert(athlete)
    .values({ userId, syntheticLabel: null })
    .onConflictDoNothing({ target: athlete.userId });
}
