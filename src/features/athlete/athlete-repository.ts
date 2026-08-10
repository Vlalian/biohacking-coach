import { eq, sql } from 'drizzle-orm';
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
 * The athlete by their opaque id, or undefined when none exists.
 *
 * Keyed off the athlete id, not the user seam: the Coach Briefing (slice 13)
 * reaches an athlete it is *linked to*, not one it owns, so it has the id, not
 * the user. This carries no identity — the domain {@link Athlete} has no name
 * (ADR 0006) — and the briefing reads it only when `shareAthleteReports` permits
 * the profile's training fields.
 */
export async function getAthleteById(
  athleteId: string,
): Promise<Athlete | undefined> {
  const rows = await getDb()
    .select()
    .from(athlete)
    .where(eq(athlete.id, athleteId))
    .limit(1);

  return rows[0] ? toAthlete(rows[0]) : undefined;
}

/**
 * The stored Information View layout, untyped: the information-view feature
 * owns its parsing (`parseLayout`); this seam just fetches what the row holds.
 * A dedicated read rather than a field on {@link Athlete} — the layout is
 * storage the Information View alone consumes, not something the app renders
 * about an athlete (slice 09's domain-shape test pins that boundary).
 */
export async function getInformationViewLayout(
  athleteId: string,
): Promise<unknown> {
  const rows = await getDb()
    .select({ layout: athlete.informationViewLayout })
    .from(athlete)
    .where(eq(athlete.id, athleteId))
    .limit(1);

  return rows[0]?.layout ?? null;
}

/**
 * Persists the athlete's Information View layout (favorites + range).
 *
 * The value arrives validated — `saveLayout` in the information-view feature is
 * the only caller and owns what a legal layout is. This is the write seam, kept
 * with the other athlete-row access so the table has one owner.
 */
export async function updateInformationViewLayout(
  athleteId: string,
  layout: { favorites: string[]; range: string },
): Promise<void> {
  await getDb()
    .update(athlete)
    .set({ informationViewLayout: layout, updatedAt: new Date() })
    .where(eq(athlete.id, athleteId));
}

/**
 * The top-level merge of `changes` into the athlete's `profile` JSONB, as a SQL
 * expression.
 *
 * Postgres' `||` merges two jsonb objects in the statement itself, so read and
 * write are one atomic operation. A select-then-update would not be: a
 * double-clicked step or a retried request can interleave, and the second write
 * would silently drop the first's changes.
 */
function profileMergedWith(changes: Partial<AthleteProfile>) {
  return sql`COALESCE(${athlete.profile}, '{}'::jsonb) || ${JSON.stringify(changes)}::jsonb`;
}

/**
 * Merges changes into the athlete's `profile` JSONB, atomically.
 *
 * Scoped to the athlete id resolved from the authenticated session upstream,
 * like every write (ADR 0006).
 */
export async function mergeAthleteProfile(
  athleteId: string,
  changes: Partial<AthleteProfile>,
): Promise<void> {
  await getDb()
    .update(athlete)
    .set({ profile: profileMergedWith(changes), updatedAt: new Date() })
    .where(eq(athlete.id, athleteId));
}

/**
 * The completion write for MCQ onboarding: the profile columns a finished
 * questionnaire produces — phase, experience, communication style, race target —
 * together with the final `profile` JSONB merge, in ONE update statement.
 *
 * One statement on purpose. Split across two writes, a failure between them
 * would leave the JSONB claiming onboarding is finished while
 * `experience_level` — the actual "onboarded" gate the page reads — stayed null,
 * stranding the athlete on a questionnaire they had already completed. A single
 * UPDATE cannot land half-applied.
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
  profileChanges: Partial<AthleteProfile>,
): Promise<void> {
  await getDb()
    .update(athlete)
    .set({
      trainingPhase: completed.trainingPhase,
      experienceLevel: completed.experienceLevel,
      communicationStyle: completed.communicationStyle,
      raceTarget: completed.raceTarget,
      profile: profileMergedWith(profileChanges),
      updatedAt: new Date(),
    })
    .where(eq(athlete.id, athleteId));
}
