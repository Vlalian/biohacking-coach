import { and, eq } from 'drizzle-orm';
import { getDb } from '../../src/db';
import { athlete, injuries, sessions, unavailableDates } from '../../src/db/schema';
import {
  generateSyntheticHistory,
  openInjuryFor,
  raceDateFor,
  toAthleteRow,
  toSessionRows,
  type SyntheticProfile,
} from '../../src/features/athlete/synthetic-history';
import { upsertTargetRace } from '../../src/features/race/race-repository';

/**
 * Writes one owner's copy of the personas: the athlete row, ten weeks of
 * generated history, the blocked dates, the Target Race and (Nadia) the open
 * Injury. Lifted out of `scripts/seed.ts` unchanged so the tester kit can seed
 * a Head Coach tester their own copy (code-health/18). Idempotent per profile
 * id: a rerun replaces the athlete row and its coach-origin sessions.
 *
 * Returns the ids to link, in profile order.
 */
export async function seedPersonas(
  profiles: readonly SyntheticProfile[],
  now: Date,
  log: (line: string) => void = console.log,
): Promise<string[]> {
  const db = getDb();
  const SEED = 20260902;
  const WEEKS = 10;

  for (const profile of profiles) {
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

    log(
      `Seeded persona ${profile.syntheticLabel}: ${generated.length} sessions over ${WEEKS} weeks ` +
        `(${generated.filter((s) => s.status === 'skipped').length} skipped), ` +
        `${blocked.length} unavailable date(s), ${profile.experienceLevel}, ` +
        `${profile.raceDistance} on ${raceDate}${injury ? ', one open Injury' : ''}.`,
    );
  }

  return profiles.map((p) => p.id);
}
