import '../src/db/load-env';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../src/db';
import { athlete, coach, coachingLink } from '../src/db/schema';
import { user } from '../src/db/auth-schema';
import { eraseAccount } from '../src/features/erasure/erasure-repository';

/**
 * Erases named accounts through the same path an athlete's own "delete my
 * account" uses (`eraseAccount`): athlete row first, then the user, with an
 * `erasure_log` entry — because `athlete.user_id` declares no cascade, the
 * order is forced, and better-auth's admin `removeUser` (user first) is
 * refused by the database (showable-version/23, 2026-09-17).
 *
 *   npx tsx scripts/erase-accounts.ts <userId> [<userId> ...]         # dry run
 *   npx tsx scripts/erase-accounts.ts --yes <userId> [<userId> ...]   # erase
 *
 * Runs against whatever DATABASE_URL `.env.local` (or the environment) names.
 * Refuses an account that holds `role = 'admin'`, or one that is the coach of
 * an active Coaching Link — those are decisions, not cleanup.
 */
async function main(argv: string[]): Promise<void> {
  const yes = argv.includes('--yes');
  const ids = argv.filter((a) => a !== '--yes');
  if (ids.length === 0) {
    console.error('usage: erase-accounts.ts [--yes] <userId> ...');
    process.exit(1);
  }

  const db = getDb();
  const users = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(inArray(user.id, ids));

  const missing = ids.filter((id) => !users.some((u) => u.id === id));
  if (missing.length > 0) {
    console.error(`not found: ${missing.join(', ')}`);
    process.exit(1);
  }

  let refused = false;
  const subjects = [];
  for (const u of users) {
    const [a] = await db.select({ id: athlete.id }).from(athlete).where(eq(athlete.userId, u.id));
    const [c] = await db.select({ id: coach.id }).from(coach).where(eq(coach.userId, u.id));
    const links = c
      ? await db
          .select({ id: coachingLink.id })
          .from(coachingLink)
          .where(eq(coachingLink.coachId, c.id))
      : [];
    const why =
      u.role === 'admin' ? 'is an admin' : links.length > 0 ? `coaches ${links.length} Coaching Link(s)` : null;
    console.log(
      `${why ? 'REFUSE' : 'erase '} ${u.name} <${u.email}> user=${u.id} athlete=${a?.id ?? '-'} coach=${c?.id ?? '-'}${why ? ` — ${why}` : ''}`,
    );
    if (why) {
      refused = true;
      continue;
    }
    if (!a) {
      console.error(`  no athlete row for ${u.id}; eraseAccount needs one — stopping`);
      process.exit(1);
    }
    subjects.push({ athleteId: a.id, userId: u.id, coachId: c?.id ?? null });
  }
  if (refused) {
    console.error('refused at least one account; nothing erased');
    process.exit(1);
  }
  if (!yes) {
    console.log(`dry run: ${subjects.length} account(s) would be erased. Re-run with --yes.`);
    return;
  }
  for (const s of subjects) {
    await eraseAccount(s);
    console.log(`erased user=${s.userId}`);
  }
  const left = await db.select({ name: user.name, role: user.role }).from(user);
  console.log(`remaining users: ${left.map((u) => `${u.name}${u.role ? ` (${u.role})` : ''}`).join(', ')}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error);
  process.exit(1);
});
