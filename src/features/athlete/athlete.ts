import type { AthleteRow } from '@/db/schema';
import type { Onboarding } from '@/features/coach/check-in';
import type { OnboardingAnswers, OnboardingSubmitted } from '@/features/onboarding/onboarding-flow';

/**
 * The Athlete Profile as stored in the `profile` JSONB.
 *
 * `onboarding` is the finished answer set in the shape the Coach prompts consume
 * (the ONBOARDING PROFILE block) — written once at completion. `onboardingAnswers`
 * and `onboardingSubmitted` are the in-progress working state: the resume point
 * for an interrupted onboarding, kept for audit after completion.
 * `fixedConstraints` (no-training days) and `weeklySessionDay` are the constraint
 * answers the Weekly Session prompt reads.
 *
 * The authoritative home of the chosen language is NOT here — a language is a
 * person's preference, not training data, so it sits on the better-auth user
 * (`ui_prefs`, ticket 05 / ticket 09) and every reader goes there. The raw
 * `onboardingAnswers.language` key is only the flow's own record of which button
 * was pressed. Nothing in this JSONB carries identity (ADR 0006).
 */
export interface AthleteProfile {
  onboarding?: Onboarding;
  onboardingAnswers?: OnboardingAnswers;
  onboardingSubmitted?: OnboardingSubmitted;
  fixedConstraints?: string[];
  weeklySessionDay?: string;
  /**
   * When the athlete's training history was imported (`garmin-integration/03`),
   * ISO timestamp. Set, the history import is locked — onboarding and Settings
   * share the one lock; null or absent, it is open. Removing the imported
   * history clears it.
   */
  historyImportedAt?: string | null;
}

/**
 * The athlete, as the app knows one.
 *
 * Deliberately narrower than the stored row: it carries what the app reads
 * today, not every column the schema holds. Slices widen it as they start
 * reading more — a field arrives here when something renders it, not when a
 * migration adds it. The Weekly Session (slice 08) is the first reader of the
 * coaching-profile fields, so they arrive here now.
 *
 * `id` is the opaque key training data hangs off (ADR 0006). There is no name
 * here: a real athlete's name is `user.name` in better-auth's tables, reached
 * through the user seam, so this object is deliberately usable without it.
 * `syntheticLabel` is the fabricated name of a synthetic athlete — a row with
 * no user — and is null for anyone who can log in (route 06).
 */
export type Athlete = {
  id: string;
  syntheticLabel: string | null;
  experienceLevel: string | null;
  communicationStyle: string | null;
  raceTarget: string | null;
  /**
   * The Race Distance this athlete trains for, or null for anyone who onboarded
   * before the question existed. Null is not "no distance" — it is "never
   * asked", and the prompt says so rather than assuming one.
   */
  raceDistance: string | null;
  /** Hours a week the athlete can train, or null for anyone onboarded before it was asked (35). */
  hoursPerWeek: number | null;
  trainingSessionsPerWeek: number | null;
  profile: AthleteProfile | null;
};

/** The one place the stored row becomes a domain object. */
export function toAthlete(row: AthleteRow): Athlete {
  return {
    id: row.id,
    syntheticLabel: row.syntheticLabel,
    experienceLevel: row.experienceLevel,
    communicationStyle: row.communicationStyle,
    raceTarget: row.raceTarget,
    raceDistance: row.raceDistance,
    hoursPerWeek: row.hoursPerWeek,
    trainingSessionsPerWeek: row.trainingSessionsPerWeek,
    profile: (row.profile as AthleteProfile | null) ?? null,
  };
}
