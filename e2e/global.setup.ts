import { execFileSync } from 'node:child_process';
import { neon as neonSql } from '@neondatabase/serverless';
import { resetBranchToParent } from '../scripts/neon-reset-branch';
import { PINNED_TODAY } from './pinned-today';

/** The suite's own database: a Neon branch cut from `seed-template`. */
const E2E_BRANCH = 'test/e2e';

function neon(args: string[]): string {
  return execFileSync('neon', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
}

/**
 * Resets the suite's database to its parent, then reseeds it, before every
 * run. The reset (frontend-quality/08) discards everything a run or a stray
 * click wrote — the seed alone (07) only converges the Coach-origin rows, so
 * an Athlete Session or a check-in would carry into the next run's pictures.
 * The parent's name is printed so a wrong parent is visible in the run log.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error('E2E_DATABASE_URL is not set');

  const reset = resetBranchToParent(E2E_BRANCH, neon);
  console.log(
    `[e2e] Reset Neon branch ${reset.branch} (${reset.branchId}) to its parent ` +
      `${reset.parentName} (${reset.parentId}); seeding.`,
  );

  execFileSync('npx', ['tsx', 'scripts/seed.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    // The seed reads the app's clock (frontend-quality/09), so it gets the same pin as the server.
    env: { ...process.env, DATABASE_URL: url, COACH_TODAY: PINNED_TODAY },
  });

  // The reset keeps whatever `seed-template` holds, personas included, and the
  // seed only adds to it (frontend-quality/10). Said out loud, so a Roster
  // picture that moved because the template changed is explained in the log.
  const [{ links }] = await neonSql(url)`
    SELECT count(*)::int AS links FROM coaching_link WHERE status = 'active'`;
  console.warn(`[e2e] Active Coaching Links after the seed: ${links}.`);
}
