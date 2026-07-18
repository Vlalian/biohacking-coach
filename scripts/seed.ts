import '../src/db/load-env';
import { getDb } from '../src/db';
import { athlete } from '../src/db/schema';
import { auth } from '../src/lib/auth';

/**
 * Seeds the database for local development and the eval.
 *
 * This replaces a browser migration, deliberately: route ticket 05 (ballot 5)
 * ended the localStorage era with the POC. Fresh data through the real flows is
 * better eval evidence anyway.
 *
 * Two kinds of athlete, seeded two different ways — because they are two
 * different things (route 06):
 *
 *   - Mads is a *real* athlete. His account is created through better-auth's own
 *     server API, not by inserting a `user` row, so the password hashing and
 *     record shape are exactly what login expects. This is also what slice 16
 *     needs: once signup is turned off on the deployment, the seed is the only
 *     way an account can exist, and it must go through this same door. Creating
 *     his user fires the create hook, which mints his athlete row with a null
 *     `synthetic_label` — his name lives on `user.name`.
 *
 *   - The synthetic athlete has no user and never logs in. It carries a
 *     fabricated `synthetic_label`, inserted directly. That is the only place a
 *     name is allowed to sit in a training table, and it names nobody real.
 *
 * Later slices grow this: the coach user and row, one active Coaching Link, and
 * a fuller synthetic roster.
 */

/** A synthetic athlete keeps a fixed id so re-running the seed converges. */
const SYNTHETIC_ATHLETE_ID = 'eff4e0bc-d603-4d5e-8ae5-369ff5bb1213';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in — the ` +
        'seed creates Mads through better-auth and needs his login details.',
    );
  }
  return value;
}

async function seedMads() {
  const email = requireEnv('SEED_MADS_EMAIL');
  const password = requireEnv('SEED_MADS_PASSWORD');

  // Idempotent by email: better-auth rejects a duplicate, which on a re-run is
  // success, not failure. Any other error is real and should stop the seed.
  try {
    await auth.api.signUpEmail({
      body: { name: 'Mads', email, password },
    });
    console.log(`Seeded real athlete: Mads (${email}) — name on user.name, synthetic_label null.`);
  } catch (err) {
    if (isDuplicateUser(err)) {
      console.log(`Real athlete ${email} already present — nothing to do.`);
      return;
    }
    throw err;
  }
}

/**
 * better-auth surfaces an existing email as a known, non-fatal condition.
 *
 * Prefer the stable error code it carries on the APIError body over the human
 * message: the message is prose and can be reworded, but the code is the
 * library's contract. Fall back to the message only when no code is present.
 */
function isDuplicateUser(err: unknown): boolean {
  const code = (err as { body?: { code?: string } })?.body?.code;
  if (code) return code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';

  const message = err instanceof Error ? err.message : String(err);
  return /exist|already/i.test(message);
}

async function seedSyntheticAthlete() {
  const [created] = await getDb()
    .insert(athlete)
    .values({
      id: SYNTHETIC_ATHLETE_ID,
      // No userId: a synthetic athlete has no login. The label is fabricated —
      // it is the only name in this table and it names nobody real.
      syntheticLabel: 'Test Athlete',
    })
    .onConflictDoNothing({ target: athlete.id })
    .returning();

  console.log(
    created
      ? `Seeded synthetic athlete: ${created.syntheticLabel} (${created.id})`
      : `Synthetic athlete ${SYNTHETIC_ATHLETE_ID} already present — nothing to do.`,
  );
}

async function seed() {
  await seedMads();
  await seedSyntheticAthlete();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
