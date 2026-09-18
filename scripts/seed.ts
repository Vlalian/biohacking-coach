import '../src/db/load-env';
import { and, eq, or } from 'drizzle-orm';
import { getDb } from '../src/db';
import {
  athlete,
  coach,
  coachingLink,
  injuries,
  sessions,
  unavailableDates,
} from '../src/db/schema';
import { user } from '../src/db/auth-schema';
import { auth } from '../src/lib/auth';
import { seedAthleteSessionId, seedWeekRows } from '../src/features/athlete/seed-history';
import { parseSeedArgs } from '../src/features/athlete/seed-personas';
import {
  SYNTHETIC_PROFILES,
  generateSyntheticHistory,
  openInjuryFor,
  raceDateFor,
  toAthleteRow,
  toSessionRows,
} from '../src/features/athlete/synthetic-history';
import { upsertTargetRace } from '../src/features/race/race-repository';

/**
 * Seeds the database for local development and the eval.
 *
 * This replaces a browser migration, deliberately: route ticket 05 (ballot 5)
 * ended the localStorage era with the POC. Fresh data through the real flows is
 * better eval evidence anyway.
 *
 * Two real accounts and nothing fabricated:
 *
 *   - Mads is a *real* athlete. His account is created through better-auth's own
 *     server API, not by inserting a `user` row, so the password hashing and
 *     record shape are exactly what login expects. This is also what slice 16
 *     needs: once signup is turned off on the deployment, the seed is the only
 *     way an account can exist, and it must go through this same door. Creating
 *     his user fires the create hook, which mints his athlete row with a null
 *     `synthetic_label` — his name lives on `user.name`.
 *
 *   - Coach Riley is a real login with a coach row and one active Coaching Link
 *     to Mads, so the Head Coach's surfaces have a real athlete to show.
 *
 * **No synthetic athlete is seeded unless asked** (code-health/13 and /16,
 * 2026-09-18). The seed used to write a shallow "Test Athlete" and two
 * generated personas from `synthetic-history.ts` and link both coaches to
 * them, so a Head Coach saw a Roster of athletes who differed. They were
 * fabricated data in a product about to be handed to real people and a tax on
 * every slice that touched the athlete shape, so /13 took them out of the
 * default path. /16 brought three back **behind `--with-personas`** for the
 * Head Coach tester round only — a tester with one athlete cannot judge the
 * Roster or the Briefing — and the flag is off by default because `test/e2e`'s
 * page baselines and the dry dev seed start from a Roster of one.
 * `scripts/retire-personas.ts` removes the rows afterwards.
 * `athlete.synthetic_label` and the `athlete_identity_source` constraint stay:
 * the column is the structural guarantee that no fabricated name can ever
 * acquire a login, which is exactly what the personas rely on.
 *
 *   npm run seed                       # Mads, Coach Riley, nothing fabricated
 *   npm run seed -- --with-personas    # ...plus the three personas on both Rosters
 */

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

  // Mads is the operator: the one account the admin plugin (auth.ts) treats as
  // an admin. Set on every run, not only on first creation, so a database that
  // predates the plugin picks it up when re-seeded.
  await getDb().update(user).set({ role: 'admin' }).where(eq(user.email, email));

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
 * Mads's week of history, from `seed-history.ts` — the past, not a plan.
 *
 * Re-seedable: his coach-origin sessions are cleared first, so re-running
 * refreshes last week rather than piling weeks up. Athlete- and Garmin-origin
 * sessions are left untouched — with one exception: the seed's own Athlete
 * Session has a fixed id and is replaced by id, so it too converges rather
 * than accumulating. Anything Mads logged himself survives.
 */
async function seedMadsTrainingHistory(athleteId: string) {
  const db = getDb();
  const rows = seedWeekRows(athleteId, new Date());

  // Atomic reseed: clear the seed's rows and insert last week's history in one
  // transaction, so a failure can never leave Mads half-seeded. neon-http has
  // no interactive transactions, but batch() is one.
  await db.batch([
    db
      .delete(sessions)
      .where(
        and(
          eq(sessions.athleteId, athleteId),
          or(eq(sessions.origin, 'coach'), eq(sessions.id, seedAthleteSessionId(athleteId))),
        ),
      ),
    db.insert(sessions).values(rows),
  ]);
  const dates = rows.map((r) => r.date).sort();
  console.log(
    `Seeded ${rows.length} completed sessions for Mads (${dates[0]}–${dates.at(-1)}), ` +
      'one of them an Athlete Session.',
  );
}

/**
 * The three personas, on `--with-personas` only (code-health/16).
 *
 * Fixed ids and a fixed random seed, so a reseed converges on the same three
 * athletes rather than reshaping the Roster every run. Each gets:
 *
 *   - the athlete row, upserted (a row from an earlier seed may carry stale
 *     profile columns, and `onConflictDoNothing` would leave them so forever);
 *   - the generated history, atomically — coach-origin sessions and Unavailable
 *     Dates cleared and re-inserted in one batch, because both are generated
 *     relative to today and a top-up would keep every history ever generated;
 *   - a Target Race through the race repository, so the Training Phase is
 *     *derived* from it (training-architecture/03) rather than stored — Nadia's
 *     race is six weeks from today on every run, which is what keeps her in the
 *     last block;
 *   - for Nadia, one open Injury at a fixed id: the athlete-facing record only
 *     (ADR 0011) — capacity per discipline and a Bother Rating, never a detail
 *     thread. Written by id rather than through `declareInjury` because that
 *     opens a new record on every call, and a reseed must replace, not pile up.
 *
 * Returns the ids to link, in profile order.
 */
async function seedPersonas(): Promise<string[]> {
  const db = getDb();
  const SEED = 20260902;
  const WEEKS = 10;
  const now = new Date();

  for (const profile of SYNTHETIC_PROFILES) {
    const { sessions: generated, unavailableDates: blocked } =
      generateSyntheticHistory(profile, WEEKS, now, SEED);
    const row = toAthleteRow(profile);
    await db.insert(athlete).values(row).onConflictDoUpdate({ target: athlete.id, set: row });

    await db.batch([
      db
        .delete(sessions)
        .where(and(eq(sessions.athleteId, profile.id), eq(sessions.origin, 'coach'))),
      db.delete(unavailableDates).where(eq(unavailableDates.athleteId, profile.id)),
      db.insert(sessions).values(toSessionRows(profile, generated, now)),
      ...blocked.map((date) =>
        db.insert(unavailableDates).values({ athleteId: profile.id, date }).onConflictDoNothing(),
      ),
    ]);

    const raceDate = raceDateFor(profile, now);
    await upsertTargetRace(profile.id, {
      name: profile.raceTarget,
      date: raceDate,
      distance: profile.raceDistance,
    });

    const injury = openInjuryFor(profile, now);
    if (injury) {
      await db
        .insert(injuries)
        .values(injury)
        .onConflictDoUpdate({ target: injuries.id, set: injury });
    }

    console.log(
      `Seeded persona ${profile.syntheticLabel}: ${generated.length} sessions over ${WEEKS} weeks ` +
        `(${generated.filter((s) => s.status === 'skipped').length} skipped), ` +
        `${blocked.length} unavailable date(s), ${profile.experienceLevel}, ` +
        `${profile.raceDistance} on ${raceDate}${injury ? ', one open Injury' : ''}.`,
    );
  }

  return SYNTHETIC_PROFILES.map((p) => p.id);
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

/**
 * The recruited coach: a real login with a coach row, and one active Coaching
 * Link to each athlete on their roster (Mads, plus the personas when seeded).
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
 * athlete row and a coach row. Without the personas it links to nobody
 * (code-health/13): his Roster is the empty state, reached at `/coach` by URL,
 * since the Navigation Drawer shows the entry only to an account holding
 * active Coaching Links. With them, he sees the same three Coach Riley does.
 */
async function seedMadsAsCoach(madsUserId: string, rosterAthleteIds: string[]) {
  await getDb()
    .insert(coach)
    .values({ id: MADS_COACH_ID, userId: madsUserId })
    .onConflictDoNothing({ target: coach.userId });
  await linkAthletes(MADS_COACH_ID, rosterAthleteIds);
  console.log(
    `Mads also holds a coach row (dual-role dev), linked to ${rosterAthleteIds.length} athlete(s).`,
  );
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

async function seed(argv: string[]) {
  const args = parseSeedArgs(argv);
  if ('error' in args) {
    throw new Error(`${args.error}\nusage: seed.ts [--with-personas]`);
  }

  const madsEmail = requireEnv('SEED_MADS_EMAIL');
  const madsId = await seedMads();
  await seedMadsTrainingHistory(madsId);
  const personaIds = args.withPersonas ? await seedPersonas() : [];
  await seedCoach([madsId, ...personaIds]);
  await seedMadsAsCoach(await madsUserId(madsEmail), personaIds);
}

seed(process.argv.slice(2))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
