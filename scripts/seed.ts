import '../src/db/load-env';
import { guardDatabase } from './db-guard/protected-database';
import { and, eq, or } from 'drizzle-orm';
import { getDb } from '../src/db';
import { athlete, sessions } from '../src/db/schema';
import { user } from '../src/db/auth-schema';
import { auth } from '../src/lib/auth';
import { startOfToday } from '../src/lib/date';
import { seedAthleteSessionId, seedWeekRows } from '../src/features/athlete/seed-history';
import { parseSeedArgs } from '../src/features/athlete/seed-personas';
import { SEED_OWNER, personasFor } from '../src/features/athlete/synthetic-history';
import { seedPersonas } from './personas/seed-personas';
import { ensureCoachRow, linkAthletes } from './personas/seed-coach-rows';
import { isDuplicateUser } from './tester-kit/mint';

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
  const rows = seedWeekRows(athleteId, startOfToday());

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

  const [coachUser] = await getDb()
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!coachUser) throw new Error('Coach user missing after signup.');

  await linkAthletes(await ensureCoachRow(coachUser.id), rosterAthleteIds);
  console.log(`Coach Riley linked to ${rosterAthleteIds.length} athletes.`);
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
  // Claimed by his user, never at a fixed id: a branch cut from `seed-template`
  // already holds one, under the template's Mads, and an id the clause does not
  // guard is how the seed used to die on its last statement (code-health/24).
  await linkAthletes(await ensureCoachRow(madsUserId), rosterAthleteIds);
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
  const personaIds = args.withPersonas ? await seedPersonas(personasFor(SEED_OWNER), startOfToday()) : [];
  await seedCoach([madsId, ...personaIds]);
  await seedMadsAsCoach(await madsUserId(madsEmail), personaIds);
}

// The one check before any write: never production by accident (db-guard).
guardDatabase(process.env.DATABASE_URL, process.argv);
seed(process.argv.slice(2))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
