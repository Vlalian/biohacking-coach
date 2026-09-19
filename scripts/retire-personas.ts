import '../src/db/load-env';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../src/db';
import { athlete, coachingLink, sessions } from '../src/db/schema';
import {
  RETIRED_PERSONA_IDS,
  describeRetirement,
  parseRetireArgs,
  planRetirement,
  type PersonaRow,
} from '../src/features/athlete/retire-personas';

/**
 * Removes the synthetic personas the seed used to write — Alex Rivera, Sam
 * Chen and the shallow "Test Athlete" — from whatever database `DATABASE_URL`
 * names (code-health/13). The seed no longer creates them; this is how the
 * rows it already wrote leave.
 *
 *   npx tsx scripts/retire-personas.ts          # dry run: prints what would go
 *   npx tsx scripts/retire-personas.ts --yes    # deletes the athlete rows
 *
 * Deleting the athlete row is enough: sessions, Coaching Links, races, blocks,
 * check-ins and the rest all declare `onDelete: 'cascade'` on `athlete_id`.
 * The dry run counts the two a reader would want to see before saying yes.
 *
 * Refuses the whole run if a row at one of these ids carries a `user_id` —
 * that is a real person, whatever id they sit under. The decisions live in
 * `retire-personas.ts`, where they are tested; this file only reads and deletes.
 */

/** The persona rows this database holds, each with what would cascade from it. */
async function findPersonas(): Promise<PersonaRow[]> {
  const db = getDb();
  const rows = await db
    .select({ id: athlete.id, syntheticLabel: athlete.syntheticLabel, userId: athlete.userId })
    .from(athlete)
    .where(inArray(athlete.id, [...RETIRED_PERSONA_IDS]));

  const found: PersonaRow[] = [];
  for (const r of rows) {
    const [s] = await db.select({ n: count() }).from(sessions).where(eq(sessions.athleteId, r.id));
    const [l] = await db
      .select({ n: count() })
      .from(coachingLink)
      .where(eq(coachingLink.athleteId, r.id));
    found.push({ ...r, sessions: s.n, links: l.n });
  }
  return found;
}

async function main(argv: string[]): Promise<void> {
  const args = parseRetireArgs(argv);
  if ('error' in args) {
    console.error(`${args.error}\nusage: retire-personas.ts [--yes]`);
    process.exit(1);
  }

  const plan = planRetirement(await findPersonas());
  for (const line of describeRetirement(plan, args.yes)) console.log(line);
  if (plan.refused.length > 0) process.exit(1);
  if (!args.yes || plan.erase.length === 0) return;

  const db = getDb();
  const ids = plan.erase.map((r) => r.id);
  // The plan was read a moment ago; a row that gained a user since is a
  // person now, so the delete re-checks ownership instead of trusting the plan.
  const erased = await db
    .delete(athlete)
    .where(and(inArray(athlete.id, ids), isNull(athlete.userId)))
    .returning({ id: athlete.id });
  const [left] = await db.select({ n: count() }).from(athlete).where(inArray(athlete.id, ids));
  console.log(`erased ${erased.length} athlete row(s); ${left.n} of them remain.`);
  if (erased.length !== ids.length) {
    console.error('some rows gained a user between the plan and the delete; they were kept.');
    process.exit(1);
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exit(1);
});
