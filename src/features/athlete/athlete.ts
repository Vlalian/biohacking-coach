import type { AthleteRow } from '@/db/schema';
import type { Equipment, Onboarding } from '@/features/coach/check-in';

/**
 * The Athlete Profile as stored in the `profile` JSONB.
 *
 * Holds the MCQ onboarding answers the Coach builds on plus the chosen UI/Coach
 * `language` (slice 09 writes these). It carries no identity — name and email
 * live only in better-auth's tables, reached through the user seam (ADR 0006).
 */
export interface AthleteProfile {
  language?: string;
  onboarding?: Onboarding;
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
  trainingPhase: string | null;
  experienceLevel: string | null;
  communicationStyle: string | null;
  raceTarget: string | null;
  trainingSessionsPerWeek: number | null;
  profile: AthleteProfile | null;
  equipment: Equipment | null;
};

/** The one place the stored row becomes a domain object. */
export function toAthlete(row: AthleteRow): Athlete {
  return {
    id: row.id,
    syntheticLabel: row.syntheticLabel,
    trainingPhase: row.trainingPhase,
    experienceLevel: row.experienceLevel,
    communicationStyle: row.communicationStyle,
    raceTarget: row.raceTarget,
    trainingSessionsPerWeek: row.trainingSessionsPerWeek,
    profile: (row.profile as AthleteProfile | null) ?? null,
    equipment: (row.equipment as Equipment | null) ?? null,
  };
}
