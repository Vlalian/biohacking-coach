import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { guardDatabase } from '../db-guard/protected-database';
import { getDb } from '../../src/db';
import { athlete, coachingLink, sessions } from '../../src/db/schema';
import {
  RETIRED_PERSONA_LABELS,
  describeRetirement,
  parseRetireArgs,
  planRetirement,
  type PersonaRow,
} from '../../src/features/athlete/retire-personas';

/**
 * Removes every copy of the synthetic personas — Alex Rivera, Sam Chen, Nadia
 * Holm and the shallow "Test Athlete" — from whatever database `DATABASE_URL`
 * names (code-health/13, 18). The seed writes them only on `--with-personas`;
 * the tester kit writes a copy per Head Coach tester; this is how all of them
 * leave after a round.
 *
 *   npx tsx scripts/retire-personas.ts          # dry run: prints what would go
 *   npx tsx scripts/retire-personas.ts --yes    # deletes the athlete rows
 *
 * Deleting the athlete row is enough: sessions, Coaching Links, races, blocks,
 * check-ins and the rest all declare `onDelete: 'cascade'` on `athlete_id`.
 * The dry run counts the two a reader would want to see before saying yes.
 *
 * Found by label and ownerlessness, never by id: a coach's copy sits at ids
 * derived from that coach. Refuses the whole run if a row under one of these
 * labels carries a `user_id` — that is a real person. The decisions live in
 * `retire-personas.ts`, where they are tested; this file reads and deletes.
 * `scripts/retire-personas.ts` is the entry point.
 */

/**
 * The persona rows this database holds, each with what would cascade from it.
 *
 * By label alone, ownerless or not: a labelled row that carries a `user_id` is
 * what `planRetirement` refuses, and filtering it out here would leave the
 * refusal unreachable — the run would erase the rest and never say that one of
 * these names belongs to somebody. The delete re-checks ownership itself.
 */
async function findPersonas(): Promise<PersonaRow[]> {
  const db = getDb();
  const rows = await db
    .select({ id: athlete.id, syntheticLabel: athlete.syntheticLabel, userId: athlete.userId })
    .from(athlete)
    .where(inArray(athlete.syntheticLabel, [...RETIRED_PERSONA_LABELS]));

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

/**
 * Deletes the planned rows, re-checking ownership as it goes: the plan was
 * read a moment ago, and a row that gained a user since is a person now. A
 * row that slips away that way is kept, and the run says so and fails.
 */
async function eraseRows(ids: string[]): Promise<void> {
  const db = getDb();
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

export async function main(argv: string[]): Promise<void> {
  guardDatabase(process.env.DATABASE_URL, argv);
  const args = parseRetireArgs(argv);
  if ('error' in args) {
    console.error(`${args.error}\nusage: retire-personas.ts [--yes] [--production]`);
    process.exit(1);
  }

  const plan = planRetirement(await findPersonas());
  for (const line of describeRetirement(plan, args.yes)) console.log(line);
  if (plan.refused.length > 0) process.exit(1);
  if (!args.yes || plan.erase.length === 0) return;

  await eraseRows(plan.erase.map((r) => r.id));
}
