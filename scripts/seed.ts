import '../src/db/load-env';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../src/db';
import { athlete, sessions, type NewSessionRow } from '../src/db/schema';
import { user } from '../src/db/auth-schema';
import { auth } from '../src/lib/auth';
import { dateKey } from '../src/lib/date';

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

async function seedMads(): Promise<string> {
  const email = requireEnv('SEED_MADS_EMAIL');
  const password = requireEnv('SEED_MADS_PASSWORD');

  // Idempotent by email: better-auth rejects a duplicate, which on a re-run is
  // success, not failure. Any other error is real and should stop the seed.
  try {
    await auth.api.signUpEmail({
      body: { name: 'Mads', email, password },
    });
    console.log('Seeded real athlete: Mads — name on user.name, synthetic_label null.');
  } catch (err) {
    if (isDuplicateUser(err)) {
      console.log('Real athlete already present — nothing to do.');
    } else {
      throw err;
    }
  }

  return madsAthleteId(email);
}

/** Resolves Mads's opaque athlete id through the user seam (never by name). */
async function madsAthleteId(email: string): Promise<string> {
  const [row] = await getDb()
    .select({ id: athlete.id })
    .from(athlete)
    .innerJoin(user, eq(athlete.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);

  if (!row) {
    throw new Error('Mads has no athlete row — the signup hook did not mint one.');
  }
  return row.id;
}

/**
 * A week of *completed* training history for Mads, laid across last Mon–Sun.
 *
 * Deliberately the past, not a future plan: a new athlete should reach the
 * calendar with no pre-planned week — the Week Plan is produced by running a
 * Weekly Session and confirming it, not by the seed. What the seed provides is
 * history the Coach can review and the Information View can chart (a couple of
 * days carry a Session Reflection so the review has real feedback to read).
 *
 * Re-seedable: his coach-origin sessions are cleared first, so re-running refreshes
 * last week rather than piling weeks up. Athlete- and Garmin-origin sessions are
 * left untouched.
 */
async function seedMadsTrainingHistory(athleteId: string) {
  const db = getDb();

  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7; // 0 = Monday
  // Last week's Monday: this week's Monday minus 7 days.
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset - 7);
  const dayDate = (offset: number) =>
    dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset));

  // One training session per day (the Rest day carries no row — the calendar
  // shows rest as the absence of a session). Two days carry a Session Reflection
  // (Body + Mind, stored on the 1–5 scale the column holds), so the Weekly
  // Session review has real feedback to read.
  const week: Array<Partial<NewSessionRow> & { day: number }> = [
    { day: 0, type: 'Endurance', duration: 60, zone: 'Zone 2', title: 'Easy aerobic ride', note: 'Keep it conversational.', feedbackBody: 4, feedbackMind: 4, feedbackComment: 'Felt smooth.' },
    { day: 1, type: 'Intensity', duration: 45, zone: 'Zone 4', title: 'Threshold intervals', note: '4 x 6 min at threshold.', feedbackBody: 2, feedbackMind: 3, feedbackComment: 'Legs heavy on the last rep.' },
    { day: 2, type: 'Recovery', duration: 40, zone: 'Zone 1', title: 'Easy swim', note: 'Technique focus, easy effort.' },
    { day: 3, type: 'Tempo', duration: 60, zone: 'Zone 3', title: 'Tempo run', note: '20 min steady in the middle.' },
    { day: 5, type: 'Endurance', duration: 180, zone: 'Zone 2', title: 'Long ride', note: 'Fuel every 45 min.' },
    { day: 6, type: 'Strength', duration: 45, title: 'Strength & mobility', note: 'Core and single-leg work.' },
  ];

  const rows: NewSessionRow[] = week.map(({ day, ...s }) => ({
    athleteId,
    date: dayDate(day),
    origin: 'coach',
    status: 'completed',
    dayOrder: 0,
    type: s.type!,
    duration: s.duration ?? null,
    zone: s.zone ?? null,
    title: s.title ?? null,
    note: s.note ?? null,
    isTraining: s.isTraining ?? true,
    feedbackBody: s.feedbackBody ?? null,
    feedbackMind: s.feedbackMind ?? null,
    feedbackComment: s.feedbackComment ?? null,
    ratedAt: s.feedbackBody != null ? now : null,
  }));

  // Atomic reseed: clear only the coach-planned sessions and insert last week's
  // history in one transaction, so a failure can never leave Mads half-seeded.
  // neon-http has no interactive transactions, but batch() is one.
  await db.batch([
    db
      .delete(sessions)
      .where(and(eq(sessions.athleteId, athleteId), eq(sessions.origin, 'coach'))),
    db.insert(sessions).values(rows),
  ]);
  console.log(`Seeded ${rows.length} completed sessions for Mads (${dayDate(0)}–${dayDate(6)}).`);
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
  const madsId = await seedMads();
  await seedMadsTrainingHistory(madsId);
  await seedSyntheticAthlete();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
