import '../src/db/load-env';
import { getDb } from '../src/db';
import { athlete } from '../src/db/schema';

/**
 * Seeds the database for local development and the eval.
 *
 * This replaces a migration, deliberately: route ticket 05 (ballot 5) ended
 * the localStorage era with the POC — nothing is carried out of a browser.
 * Fresh data through the real flows is better eval evidence anyway.
 *
 * Slice 01 seeds one athlete with no login. Later slices grow this: the coach
 * user and row, one active Coaching Link, and the shallow synthetic athletes
 * that give the Roster contrast.
 */

/**
 * Mads's athlete row has a fixed id so the seed converges on the same row
 * every run, whatever else is in the table.
 *
 * The obvious alternative — "insert unless the table has any athlete" — is
 * wrong twice over: one unrelated row (a synthetic athlete, say) would skip
 * the fixture entirely, and two runs racing each other could both find an
 * empty table and insert. A fixed id lets the primary key settle both, since
 * the database decides rather than a read that has already gone stale.
 */
const MADS_ATHLETE_ID = 'eff4e0bc-d603-4d5e-8ae5-369ff5bb1213';

async function seed() {
  const [created] = await getDb()
    .insert(athlete)
    .values({
      id: MADS_ATHLETE_ID,
      displayName: 'Mads',
      // userId stays null until slice 02 brings better-auth. An athlete row
      // without a user is exactly what a synthetic athlete is, so this is the
      // real shape, not a placeholder.
    })
    .onConflictDoNothing({ target: athlete.id })
    .returning();

  console.log(
    created
      ? `Seeded athlete: ${created.displayName} (${created.id})`
      : `Athlete ${MADS_ATHLETE_ID} already present — nothing to do.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
