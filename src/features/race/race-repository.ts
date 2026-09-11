import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { race, type RaceRow } from '@/db/schema';
import type { RaceDistance } from '@/lib/race-distances';

/**
 * Races, read and written (`training-architecture/02`).
 *
 * A Race is an entity from the start rather than two columns on the athlete: an
 * athlete has **zero or more**, and at most one is the current **Target Race**.
 * Managing several is slice 09 — this module is the shape that slice needs,
 * landed now because building it as columns would have cost a migration later
 * for something already decided.
 */

/** What creating a Race requires. There is no half of one. */
export interface NewRace {
  name: string;
  /** `YYYY-MM-DD`. A real date, never prose — see `db/schema.ts`. */
  date: string;
  distance: RaceDistance;
}

/**
 * Adds a Race. `asTarget` marks it the Target Race in the same write.
 *
 * Onboarding's first race is created with `asTarget: true`; a later race added
 * alongside an existing target is not, and {@link setTargetRace} rotates the
 * flag when the athlete points at a different one.
 */
export async function createRace(
  athleteId: string,
  newRace: NewRace,
  { asTarget = true }: { asTarget?: boolean } = {},
): Promise<void> {
  await getDb().insert(race).values({ athleteId, ...newRace, isTarget: asTarget });
}

/** Every Race this athlete has, earliest first. Empty is an ordinary answer. */
export async function getRaces(athleteId: string): Promise<RaceRow[]> {
  return getDb()
    .select()
    .from(race)
    .where(eq(race.athleteId, athleteId))
    .orderBy(asc(race.date));
}

/**
 * The Target Race, or null when the athlete has none — either because they said
 * they have no race yet, or because every race they had has passed and none has
 * been made the target since.
 */
export async function getTargetRace(athleteId: string): Promise<RaceRow | null> {
  const rows = await getDb()
    .select()
    .from(race)
    .where(and(eq(race.athleteId, athleteId), eq(race.isTarget, true)))
    .orderBy(asc(race.date));
  return rows[0] ?? null;
}

/**
 * Points the athlete at a different Race.
 *
 * Clearing the old flag and setting the new one go in **one `db.batch`**, which
 * neon-http runs as a transaction. Two separate round trips could land the set
 * before the clear, and the partial unique index allows one target per athlete —
 * so the write would be rejected by the database rather than merely racy. The
 * http driver offers no interactive transaction to do this any other way; this
 * is the same constraint `unavailable-date.ts` works within.
 */
export async function setTargetRace(athleteId: string, raceId: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db.update(race).set({ isTarget: false }).where(eq(race.athleteId, athleteId)),
    db
      .update(race)
      .set({ isTarget: true })
      .where(and(eq(race.athleteId, athleteId), eq(race.id, raceId))),
  ]);
}

/**
 * Sets the athlete's Target Race — updating the one they have, or creating it.
 *
 * Reads the current target, then writes: two round trips, and deliberately not
 * defended against a concurrent edit. The two writers of this row are the
 * athlete's own Settings page and their own onboarding, which cannot run at the
 * same time, so the window between the read and the write is not one anybody
 * can stand in. The Head Coach does not write races. If that ever changes, this
 * wants the same treatment `sessions` got — a version column and a conditional
 * write (ADR 0010) — rather than a comment promising it is fine.
 */
export async function upsertTargetRace(athleteId: string, newRace: NewRace): Promise<void> {
  const existing = await getTargetRace(athleteId);
  if (!existing) {
    // No `{ asTarget: true }`: that is `createRace`'s default, and saying it
    // again gives the reader two places to check and the mutation gate a
    // survivor it can never kill.
    await createRace(athleteId, newRace);
    return;
  }
  await getDb()
    .update(race)
    .set({ name: newRace.name, date: newRace.date, distance: newRace.distance })
    .where(eq(race.id, existing.id));
}

/**
 * Leaves the athlete with no Target Race.
 *
 * The races themselves are kept — a race that has been run is a record, and
 * slice 09 reads them. Only the pointer is cleared, which is what "between
 * races" actually means.
 */
export async function clearTargetRace(athleteId: string): Promise<void> {
  await getDb()
    .update(race)
    .set({ isTarget: false })
    .where(eq(race.athleteId, athleteId));
}

/**
 * Removes a Race the athlete entered (slice 09).
 *
 * The athlete id is in the `WHERE` beside the race id, so a race id alone —
 * held or guessed — deletes nothing that is not theirs (ADR 0006). The caller
 * owns the mirror column: removing the Target Race must also clear
 * `athlete.race_target`, which lives on another table and is the action
 * layer's to keep in step, as `updateTargetRaceAction` already does.
 */
export async function deleteRace(athleteId: string, raceId: string): Promise<void> {
  await getDb()
    .delete(race)
    .where(and(eq(race.athleteId, athleteId), eq(race.id, raceId)));
}
