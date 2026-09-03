import '../src/db/load-env';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../src/db';
import {
  athlete,
  coach,
  coachingLink,
  sessions,
  unavailableDates,
  type NewSessionRow,
} from '../src/db/schema';
import { user } from '../src/db/auth-schema';
import { auth } from '../src/lib/auth';
import { dateKey } from '../src/lib/date';
import {
  SYNTHETIC_PROFILES,
  generateSyntheticHistory,
  toAthleteRow,
  toSessionRows,
} from '../src/features/athlete/synthetic-history';

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

/**
 * The generated roster: athletes with no login, each with a full Athlete Profile
 * and ten weeks of history (showable-version/03). Their ids and shapes now live
 * beside the generator that fills them, so the seed has one source rather than a
 * list here and a matching list there.
 */
const SYNTHETIC_ROSTER = SYNTHETIC_PROFILES.map((p) => ({
  id: p.id,
  label: p.syntheticLabel,
}));

/** A fixed id for Mads's dev coach row, so the dual-role seed is idempotent. */
const MADS_COACH_ID = 'd3a9e2f4-5b6c-4d7e-8f90-1a2b3c4d5e6f';

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

/**
 * The two generated athletes the Head Coach's surfaces are evaluated against
 * (showable-version/03).
 *
 * These rows existed before with three sessions each — enough to prove the
 * Roster was not a one-row special case, and nothing more. A Head Coach judging
 * whether the Coach Briefing tells them something they did not already know
 * cannot do it against three sessions, so each now carries a full Athlete
 * Profile and ten weeks of history from {@link generateSyntheticHistory}.
 *
 * All the shaping lives in that module, which is pure and tested. This stays
 * what a seed should be: a thin wiring of generated data to the database.
 *
 * Re-runnable by the same pattern as Mads's history — fixed ids, and an atomic
 * delete-then-insert of `origin: 'coach'` rows in one batch, so anything an
 * athlete or an import produced survives a reseed untouched.
 */
async function seedGeneratedAthletes() {
  const db = getDb();
  // Fixed, for the same reason the athlete ids are: a reseed should converge on
  // the same two athletes rather than reshape the Roster every run.
  const SEED = 20260902;
  const WEEKS = 10;
  const now = new Date();

  for (const profile of SYNTHETIC_PROFILES) {
    const { sessions: generated, unavailableDates: blocked } =
      generateSyntheticHistory(profile, WEEKS, now, SEED);
    const row = toAthleteRow(profile);

    // Updated on every run, not just inserted: these two rows already exist from
    // the earlier shallow seed with null profile columns, and
    // `onConflictDoNothing` would leave them that way forever — a Roster entry
    // with no profile behind it, which is the state this ticket exists to end.
    await db
      .insert(athlete)
      .values(row)
      .onConflictDoUpdate({ target: athlete.id, set: row });

    const rows: NewSessionRow[] = toSessionRows(profile, generated, now);

    await db.batch([
      db
        .delete(sessions)
        .where(
          and(eq(sessions.athleteId, profile.id), eq(sessions.origin, 'coach')),
        ),
      // Cleared, not just topped up. The blocked days are generated relative to
      // `now`, so a reseed on a later day produces a different set — and without
      // this, the old ones stay. Two runs a week apart left the calendar showing
      // both weeks' Unavailable Dates, and the seed is meant to converge on one
      // history rather than accumulate every history it has ever generated.
      db.delete(unavailableDates).where(eq(unavailableDates.athleteId, profile.id)),
      db.insert(sessions).values(rows),
      // Keyed (athlete, date), so re-seeding the same days is a no-op rather
      // than a duplicate-key failure that would abort the batch.
      ...blocked.map((date) =>
        db
          .insert(unavailableDates)
          .values({ athleteId: profile.id, date })
          .onConflictDoNothing(),
      ),
    ]);

    console.log(
      `Seeded ${profile.syntheticLabel}: ${rows.length} sessions over ${WEEKS} weeks, ` +
        `${blocked.length} unavailable date(s), ` +
        `${profile.experienceLevel} in ${profile.trainingPhase}.`,
    );
  }
}

/**
 * The recruited coach: a real login with a coach row, and one active Coaching
 * Link to each athlete on their roster (Mads + the synthetic roster).
 *
 * Like Mads, the coach account goes through better-auth's own API so login sees
 * the record it expects. That signup fires the create hook, which also mints an
 * athlete row for the coach's user — harmless: a coach may also be an athlete,
 * and nothing points a Coaching Link at that unused row.
 */
async function seedCoach(rosterAthleteIds: string[]) {
  const email = requireEnv('SEED_COACH_EMAIL');
  const password = requireEnv('SEED_COACH_PASSWORD');

  try {
    await auth.api.signUpEmail({ body: { name: 'Coach Riley', email, password } });
    console.log('Seeded coach account: Coach Riley.');
  } catch (err) {
    if (isDuplicateUser(err)) {
      console.log('Coach account already present — nothing to do.');
    } else {
      throw err;
    }
  }

  const db = getDb();
  const [coachUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!coachUser) throw new Error('Coach user missing after signup.');

  const [coachRow] = await db
    .insert(coach)
    .values({ userId: coachUser.id })
    .onConflictDoNothing({ target: coach.userId })
    .returning({ id: coach.id });
  const coachId = coachRow?.id ?? (await coachIdForUser(coachUser.id));

  await linkAthletes(coachId, rosterAthleteIds);
  console.log(`Coach Riley linked to ${rosterAthleteIds.length} athletes.`);
}

/** Resolves an existing coach row's id when the insert was a no-op. */
async function coachIdForUser(userId: string): Promise<string> {
  const [row] = await getDb()
    .select({ id: coach.id })
    .from(coach)
    .where(eq(coach.userId, userId))
    .limit(1);
  if (!row) throw new Error('Coach row missing for user.');
  return row.id;
}

/**
 * Creates one active Coaching Link per athlete, idempotently. The partial
 * unique index guards the active pair, so `onConflictDoNothing` makes a re-seed
 * a no-op rather than a duplicate.
 */
async function linkAthletes(coachId: string, athleteIds: string[]) {
  const db = getDb();
  for (const athleteId of athleteIds) {
    await db
      .insert(coachingLink)
      .values({ coachId, athleteId })
      .onConflictDoNothing();
  }
}

/**
 * Mads holds a coach row too (ballot 1: "Mads can hold a coach row for dev").
 * This is the dual-role person made real in the seed — one user with both an
 * athlete row and a coach row — with a link to the synthetic roster so his
 * coach capacity has something to show.
 */
async function seedMadsAsCoach(madsUserId: string, rosterAthleteIds: string[]) {
  const db = getDb();
  await db
    .insert(coach)
    .values({ id: MADS_COACH_ID, userId: madsUserId })
    .onConflictDoNothing({ target: coach.userId });
  const [row] = await db
    .select({ id: coach.id })
    .from(coach)
    .where(eq(coach.userId, madsUserId))
    .limit(1);
  if (row) await linkAthletes(row.id, rosterAthleteIds);
  console.log('Mads also holds a coach row (dual-role dev) linked to the synthetic roster.');
}

/** Resolves Mads's user id through his athlete row, for the dual-role seed. */
async function madsUserId(email: string): Promise<string> {
  const [row] = await getDb()
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!row) throw new Error('Mads user missing.');
  return row.id;
}

async function seed() {
  const madsEmail = requireEnv('SEED_MADS_EMAIL');
  const madsId = await seedMads();
  await seedMadsTrainingHistory(madsId);
  await seedSyntheticAthlete();
  await seedGeneratedAthletes();

  const rosterIds = [madsId, ...SYNTHETIC_ROSTER.map((a) => a.id)];
  await seedCoach(rosterIds);
  await seedMadsAsCoach(await madsUserId(madsEmail), SYNTHETIC_ROSTER.map((a) => a.id));
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
