import 'dotenv/config';
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
async function seed() {
  const existing = await getDb().select().from(athlete).limit(1);

  if (existing.length > 0) {
    console.log(`Athlete already present (${existing[0].displayName}) — nothing to do.`);
    return;
  }

  const [created] = await getDb()
    .insert(athlete)
    .values({
      displayName: 'Mads',
      // userId stays null until slice 02 brings better-auth. An athlete row
      // without a user is exactly what a synthetic athlete is, so this is the
      // real shape, not a placeholder.
    })
    .returning();

  console.log(`Seeded athlete: ${created.displayName} (${created.id})`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
