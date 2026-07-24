import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { athlete } from '@/db/schema';
import type { CompletedProfile } from '@/features/onboarding/onboarding-flow';
import { toAthlete, type Athlete, type AthleteProfile } from './athlete';

/**
 * The only place the app reads athletes out of Postgres.
 *
 * "The current athlete" is the one a signed-in user owns: the page resolves the
 * session to a user id and asks for that athlete (slice 02, replacing slice 01's
 * "the single seeded row"). Because callers depend on this function and the
 * domain type rather than on the row, widening what an athlete is stays a change
 * to this file.
 *
 * Returns undefined when no athlete is linked to the user — the page treats that
 * as "signed in but unprovisioned" rather than crashing. In normal operation the
 * signup hook mints the row, so this is the seam being defensive, not a path a
 * real user reaches.
 */
export async function getAthleteByUserId(
  userId: string,
): Promise<Athlete | undefined> {
  const rows = await getDb()
    .select()
    .from(athlete)
    .where(eq(athlete.userId, userId))
    .limit(1);

  return rows[0] ? toAthlete(rows[0]) : undefined;
}

/**
 * Merges changes into the athlete's `profile` JSONB.
 *
 * Read-merge-write rather than a JSONB patch: onboarding answers arrive one step
 * at a time from a single athlete's own flow, so a lost-update race would require
 * the same person answering in two tabs in the same instant — the simple shape
 * wins. Scoped to the athlete id resolved from the authenticated session
 * upstream, like every write (ADR 0006).
 */
export async function mergeAthleteProfile(
  athleteId: string,
  changes: Partial<AthleteProfile>,
): Promise<AthleteProfile> {
  const db = getDb();
  const rows = await db
    .select({ profile: athlete.profile })
    .from(athlete)
    .where(eq(athlete.id, athleteId))
    .limit(1);

  const current = (rows[0]?.profile as AthleteProfile | null) ?? {};
  const merged = { ...current, ...changes };
  await db
    .update(athlete)
    .set({ profile: merged, updatedAt: new Date() })
    .where(eq(athlete.id, athleteId));
  return merged;
}

/**
 * Writes the profile columns a completed MCQ onboarding produces — phase,
 * experience, communication style, race target — in one update. The JSONB
 * answers were already merged step by step; this is the completion write that
 * makes the athlete "onboarded" (the gate reads `experienceLevel IS NOT NULL`).
 *
 * Deliberately NOT written here: `trainingSessionsPerWeek` and `equipment`.
 * Ticket 09 lists them among the profile fields, but the POC's question set —
 * the ticket's own specification — never asks for either (weekly *hours* is a
 * JSONB answer, not a session count; equipment has its own tab in the POC).
 * They stay null until a feature actually collects them.
 */
export async function completeAthleteOnboarding(
  athleteId: string,
  completed: CompletedProfile,
): Promise<void> {
  await getDb()
    .update(athlete)
    .set({
      trainingPhase: completed.trainingPhase,
      experienceLevel: completed.experienceLevel,
      communicationStyle: completed.communicationStyle,
      raceTarget: completed.raceTarget,
      updatedAt: new Date(),
    })
    .where(eq(athlete.id, athleteId));
}
