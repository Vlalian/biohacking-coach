import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { guardDatabase } from '../db-guard/protected-database';
import { getDb } from '../../src/db';
import { athlete, coach, coachingLink } from '../../src/db/schema';
import { user } from '../../src/db/auth-schema';
import { auth } from '../../src/lib/auth';
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
 * (code-health/18), the filled welcome email under `.scratch/…/testers/`,
 * one line in the register, and the login printed once.
 *
 *   npx tsx scripts/mint-tester.ts --name "Sarah" --email s@x.dk
 *   npx tsx scripts/mint-tester.ts --name "Tom" --email t@x.dk --coach --personas
 *   npx tsx scripts/mint-tester.ts --name "Tom" --email t@x.dk --coach --athletes s@x.dk
 *
 * Refuses production without `--production` (db-guard). A duplicate email
 * stops the run before anything is filed. `scripts/mint-tester.ts` is the
 * entry point; the decisions are in `mint.ts`, where they are tested.
 */

// Beside this file, not under `docs/`: `docs/` is local-only by .gitignore,
// and the template is source the kit cannot run without.
const TEMPLATE = fileURLToPath(new URL('./welcome-email.md', import.meta.url));
const TESTERS_DIR = join('.scratch', 'showable-version', 'testers');

export async function main(argv: string[]): Promise<void> {
  guardDatabase(process.env.DATABASE_URL, argv);
  const args = parseMintArgs(argv);
  if (!args.ok) throw new Error(args.usage);
  const { request } = args;
  const steps = planMint(request);

  // Every athlete resolved before any write: a typo in one email must not
  // leave a half-minted coach behind.
  const athleteIds = await resolveAthletes(steps);
  const password = generatePassword();
  const userId = await signUp(request, password);

  // Only a coach has links; an athlete's mint ends at the signup hook.
  if (steps.some((s) => s.kind === 'ensureCoach')) {
    const coachId = await ensureCoach(userId);
    const personaIds = await seedPlannedPersonas(steps, request.name);
    await link(coachId, [...personaIds, ...athleteIds]);
  }

  file(request, password);
  console.log(`minted ${request.coach ? 'coach' : 'athlete'} ${request.email} ${password}`);
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
    const ids = await seedPersonas(profiles, new Date(), console.log);
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

async function signUp(request: MintRequest, password: string): Promise<string> {
  try {
    const result = await auth.api.signUpEmail({
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

/** The filled email beside the register; the password is in the email only. */
function file(request: MintRequest, password: string): void {
  const template = readFileSync(TEMPLATE, 'utf8');
  const email = renderWelcome(template, { name: request.name, email: request.email, password });
  if (!existsSync(TESTERS_DIR)) mkdirSync(TESTERS_DIR, { recursive: true });
  writeFileSync(join(TESTERS_DIR, `${slug(request.name)}.md`), email, 'utf8');

  // The first mint opens the register with its own header; later ones append.
  const register = join(TESTERS_DIR, 'REGISTER.md');
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
