import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { guardDatabase } from '../db-guard/protected-database';
import { getDb } from '../../src/db';
import { athlete, coach, coachingLink } from '../../src/db/schema';
import { user } from '../../src/db/auth-schema';
import { auth } from '../../src/lib/auth';
import { startOfToday } from '../../src/lib/date';
import { personasFor } from '../../src/features/athlete/synthetic-history';
import { seedPersonas } from '../personas/seed-personas';
import {
  USAGE,
  generatePassword,
  isDuplicateUser,
  parseMintArgs,
  planMint,
  registerLine,
  REGISTER_HEADER,
  renderWelcome,
  type MintRequest,
  type MintStep,
} from './mint';

/**
 * Mints one tester's login (showable-version/04): the account through
 * better-auth (the signup hook provisions the athlete row and the consent
 * gate still runs on first sign-in), a coach row and Coaching Links for a
 * Head Coach tester, their own copy of the three personas on `--personas`
 * (code-health/18), the filled welcome email outside every repo, one line in
 * the register, and the login printed once.
 *
 *   npx tsx scripts/mint-tester.ts --name "Sarah" --email s@x.dk
 *   npx tsx scripts/mint-tester.ts --name "Tom" --email t@x.dk --coach --personas
 *   npx tsx scripts/mint-tester.ts --name "Tom" --email t@x.dk --coach --athletes s@x.dk
 *   npx tsx scripts/mint-tester.ts --personas-only --email t@x.dk   # after a retire
 *
 * Refuses production without `--production` (db-guard). A duplicate email
 * stops the run before anything is filed. `scripts/mint-tester.ts` is the
 * entry point; the decisions are in `mint.ts`, where they are tested.
 */

// Beside this file, not under `docs/`: `docs/` is local-only by .gitignore,
// and the template is source the kit cannot run without.
const TEMPLATE = fileURLToPath(new URL('./welcome-email.md', import.meta.url));
/**
 * Where the register lives: with the rest of the tracker, because it carries no
 * secret — a date, a name, an email, a role.
 */
const REGISTER_DIR = join('.scratch', 'showable-version', 'testers');

/**
 * Where the filled email lives: outside every git repo (ruling, 2026-09-23).
 * The tracker is a git repo with a remote of its own, and this file holds the
 * tester's password. It is temporary by intent, but it stays live until that
 * tester changes it and nothing reports when they do — so it never enters a
 * history that cannot be cleaned. `TESTER_EMAIL_DIR` overrides the default,
 * which sits beside the checkout rather than inside it.
 */
const EMAIL_DIR = process.env.TESTER_EMAIL_DIR ?? join('..', 'tester-emails');

export async function main(argv: string[]): Promise<void> {
  guardDatabase(process.env.DATABASE_URL, argv);
  const args = parseMintArgs(argv);
  if (!args.ok) throw new Error(args.usage);
  const { request } = args;
  const steps = planMint(request);

  if (request.personasOnly) {
    await topUp(steps, request.email);
    return;
  }

  // Every athlete resolved before any write: a typo in one email must not
  // leave a half-minted coach behind.
  const athleteIds = await resolveAthletes(steps);
  const password = generatePassword();
  const userId = await createAccount(request, password);
  // Filed before anything else can fail: a mint that dies in `ensureCoach` or
  // the seed would otherwise leave an account nobody holds the password for,
  // and minting it again is refused (CodeRabbit, PR #99).
  file(request, password);

  // Only a coach has links; an athlete's mint ends at the create hook.
  if (steps.some((s) => s.kind === 'ensureCoach')) {
    const coachId = await ensureCoach(userId);
    const personaIds = await seedPlannedPersonas(steps, request.name);
    await link(coachId, [...personaIds, ...athleteIds]);
  }

  console.log(`minted ${request.coach ? 'coach' : 'athlete'} ${request.email} ${password}`);
}

/**
 * Gives a coach who already has a login their three personas back
 * (`--personas-only`, ruled 2026-09-23). `retire-personas` erases every
 * coach's copies at once, so without this the only way back from one command
 * mid-round is hand SQL. Nothing is signed up, nothing is filed, and no
 * register line is written: the account and its welcome email already exist.
 */
async function topUp(steps: MintStep[], email: string): Promise<void> {
  const coachId = await findCoach(email);
  const personaIds = await seedPlannedPersonas(steps, email);
  await link(coachId, personaIds);
  console.log(`topped up ${email.toLowerCase()} with ${personaIds.length} personas`);
}

/** The coach row behind an email that must already have one. */
async function findCoach(email: string): Promise<string> {
  const [row] = await getDb()
    .select({ id: coach.id })
    .from(coach)
    .innerJoin(user, eq(coach.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);
  if (!row) throw new Error(`no coach account for ${email}; mint them first`);
  return row.id;
}

/**
 * Runs the plan's `seedPersonas` step, then resolves each `linkPersona` step
 * to the row the seed says carries that label. By label, not by position: the
 * plan names personas and the seed reports names, so neither has to trust the
 * other's ordering.
 */
async function seedPlannedPersonas(steps: MintStep[], testerName: string): Promise<string[]> {
  const written = new Map<string, string>();
  for (const step of steps) {
    if (step.kind !== 'seedPersonas') continue;
    const profiles = personasFor(step.ownerKey);
    // `seedPersonas` returns the ids in the order of the profiles it was
    // given, which is how each id finds the name it belongs to.
    const ids = await seedPersonas(profiles, startOfToday(), console.log);
    profiles.forEach((profile, i) => written.set(profile.syntheticLabel, ids[i]));
    console.log(`${testerName} holds their own copy of ${ids.length} personas.`);
  }

  const ids: string[] = [];
  for (const step of steps) {
    if (step.kind !== 'linkPersona') continue;
    const id = written.get(step.persona);
    if (id === undefined) throw new Error(`the seed wrote no persona called ${step.persona}`);
    ids.push(id);
  }
  return ids;
}

async function resolveAthletes(steps: MintStep[]): Promise<string[]> {
  const ids: string[] = [];
  for (const step of steps) {
    if (step.kind !== 'linkAthlete') continue;
    const [row] = await getDb()
      .select({ id: athlete.id })
      .from(athlete)
      .innerJoin(user, eq(athlete.userId, user.id))
      .where(eq(user.email, step.athleteEmail))
      .limit(1);
    if (!row) throw new Error(`no athlete account for ${step.athleteEmail}; mint them first`);
    ids.push(row.id);
  }
  return ids;
}

/**
 * Creates the account through the admin plugin rather than `signUpEmail`.
 *
 * The deployment sets `DISABLE_SIGNUP=true`, and better-auth enforces that on
 * its own server API as well as on the form — so the door this kit exists to
 * use would be shut on the one database it matters for (CodeRabbit, PR #99).
 * `createUser` goes through the same internal adapter, so the create hook still
 * provisions the athlete row, and it reports a duplicate with the same code.
 * Called with no request or headers, it skips the admin-session check.
 */
async function createAccount(request: MintRequest, password: string): Promise<string> {
  try {
    const result = await auth.api.createUser({
      body: { name: request.name, email: request.email, password },
    });
    return result.user.id;
  } catch (err) {
    if (isDuplicateUser(err)) throw new Error(`${request.email} already has a login; nothing minted`);
    throw err;
  }
}

/** The coach row, created or found — the seed's `seedCoach` shape. */
async function ensureCoach(userId: string): Promise<string> {
  const db = getDb();
  const [inserted] = await db
    .insert(coach)
    .values({ userId })
    .onConflictDoNothing({ target: coach.userId })
    .returning({ id: coach.id });
  if (inserted) return inserted.id;
  const [existing] = await db.select({ id: coach.id }).from(coach).where(eq(coach.userId, userId)).limit(1);
  if (!existing) throw new Error('coach row missing after insert');
  return existing.id;
}

/** One active Coaching Link per athlete; the partial unique index makes a rerun a no-op. */
async function link(coachId: string, athleteIds: string[]): Promise<void> {
  for (const athleteId of athleteIds) {
    await getDb().insert(coachingLink).values({ coachId, athleteId }).onConflictDoNothing();
  }
}

/** The filled email, and the register line that never carries the password. */
function file(request: MintRequest, password: string): void {
  const template = readFileSync(TEMPLATE, 'utf8');
  const email = renderWelcome(template, { name: request.name, email: request.email, password });
  if (!existsSync(EMAIL_DIR)) mkdirSync(EMAIL_DIR, { recursive: true });
  // Named after the tester *and* their email: two testers called Sarah would
  // otherwise share a filename, and the second mint would delete the first
  // one's unsent email — which holds a live password (CodeRabbit, PR #99).
  const emailPath = join(EMAIL_DIR, `${slug(`${request.name} ${request.email}`)}.md`);
  writeFileSync(emailPath, email, 'utf8');
  console.log(`filed ${resolve(emailPath)} — the password is in it; it is not in any repo`);

  if (!existsSync(REGISTER_DIR)) mkdirSync(REGISTER_DIR, { recursive: true });
  // The first mint opens the register with its own header; later ones append.
  const register = join(REGISTER_DIR, 'REGISTER.md');
  const opening = existsSync(register) ? '' : `${REGISTER_HEADER}\n`;
  appendFileSync(register, `${opening}${registerLine(request, new Date())}\n`, 'utf8');
}

/**
 * A filename from a tester's name. The Danish letters are folded the way Danes
 * write them without a keyboard: `\u00f8` has no decomposed form, so NFKD alone
 * would drop it and file S\u00f8ren under `s-ren`.
 */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\u00e6/g, 'ae')
    .replace(/\u00f8/g, 'oe')
    .replace(/\u00e5/g, 'aa')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export { USAGE };
