import type { EquipmentItem } from '@/features/equipment/equipment';
import { assertNoDirectIdentifier } from '@/lib/identifiers';

/**
 * Re-exported, not redefined. The walk moved to `lib/identifiers.ts` for
 * `knowledge-oracle/03` — the Knowledge Oracle needs the same guard and must not
 * import out of the Coach feature to get it. Every existing caller imports it
 * from here and keeps working; new callers should prefer `@/lib/identifiers`.
 */
export { assertNoDirectIdentifier };

/**
 * The plain-data inputs the Coach prompts reason about.
 *
 * These types are the seam between "what the app knows about an athlete" and
 * "how that reasoning is serialised into a system prompt". They are framework-
 * free and carry no identity beyond an optional display `personaName` — which is
 * a persona label for the POC personas, never a real name or email reaching the
 * model (GDPR decision 1). The server-side check-in builder never populates it
 * from a user record.
 */

/**
 * The bodily state an athlete reports at a Check-in: the numbers behind
 * CONTEXT.md's "perceived energy, physical condition, sleep quality".
 *
 * One object, because the five are one report — an athlete gives all of them or
 * gives none. Modelling them as five separate optional fields let a check-in
 * exist with two of them, which no Check-in produces and which the prompts could
 * only mis-render.
 */
export interface Readiness {
  body: number;
  mental: number;
  energy: number;
  sleep: number;
  pulse: number;
}

/** The answers an athlete gave during MCQ onboarding (slice 09 writes these). */
export interface Onboarding {
  /** Hours a week the athlete can train — a ceiling to plan within. */
  availableHours?: string | null;
  sportBackground?: string | string[] | null;
  motivation?: string | null;
  bestTime?: string | null;
  weakestDiscipline?: string | string[] | null;
  hasHumanCoach?: string | null;
  targetTime?: string | null;
  trackedMetrics?: string | string[] | null;
}

/**
 * One prior session as pattern detection sees it. Silent-Pattern-Insight
 * material: sleep, whether the athlete pushed back, the type, resting pulse, and
 * the post-session body/mind feedback.
 */
export interface SessionHistoryItem {
  sleep?: number;
  pulse?: number;
  pushedBack?: boolean;
  sessionType?: string;
  bodyFeedback?: number;
  mindFeedback?: number;
}

/** A session the athlete tapped from the Training Plan to discuss. */
export interface SessionContext {
  type: string;
  dayLabel: string;
  duration: string;
  zone: string;
  note: string;
  status?: string;
}

/** One rated session in last week's feedback summary. */
export interface WeekFeedbackEntry {
  dateKey: string;
  sessionType?: string;
  body: number;
  mind: number;
  comment?: string | null;
}

/** A skipped session, referenced by date + type, never by id. */
export interface SkippedSession {
  date: string;
  sessionType: string;
  position?: number;
}

/** The week's Session Moves and Athlete Session creations, as the Coach sees them. */
export interface WeekActivity {
  moves?: {
    sessionType: string;
    from: string;
    to: string;
    position?: number;
  }[];
  creations?: {
    sessionType: string;
    dateKey: string;
    retro?: boolean;
  }[];
}

/**
 * Everything a check-in carries into a prompt.
 *
 * `readiness` is optional because until a Check-in feature exists the athlete has
 * never reported one. Absent means the prompts render the STATE line without
 * scores and tell the Coach to ask, rather than inventing a number
 * (code-health/07). It is one nested object rather than five optional fields
 * precisely so "half a readiness" cannot be constructed: a partial one would
 * render as no readiness at all *and* have the prompt tell the model there is
 * none — a false claim in the opposite direction.
 *
 * The rest describe the athlete's phase, profile and preferences and are
 * optional because a brand-new athlete has few of them.
 */
export interface CheckIn {
  readiness?: Readiness;
  phase?: string;
  personaName?: string;
  sessionCount?: number;
  commStyle?: string;
  experienceLevel?: string;
  language?: string;
  equipment?: EquipmentItem[];
  raceTarget?: string | null;
  onboarding?: Onboarding | null;
  weeklySessionDay?: string;
  fixedConstraints?: string[];
  weeklySessionNumber?: number;
}


/**
 * Fails closed if a check-in built from app data would carry a direct identifier
 * into a prompt (GDPR decision 1 / ADR 0006). The rule is load-bearing for the
 * whole GDPR posture, so it is a runtime assertion, not a convention: the app's
 * check-in builder calls this before the check-in can reach a prompt.
 *
 * `personaName` is a persona label reserved for synthetic personas and the eval
 * harness; the app path must never set it from a real athlete, so here it must be
 * absent. No field may look like an email — and the walk is deep, because the
 * places an identifier realistically hides are the free-text leaves (an
 * onboarding answer, an equipment item's `details`), not the top-level scalars. This is the
 * assertion the "no direct identifier reaches the LLM" standard requires the
 * prompt builders to make — enforced once, at the seam where app data becomes
 * prompt input.
 */
export function assertNoIdentity(checkIn: CheckIn): void {
  if (checkIn.personaName !== undefined) {
    throw new Error(
      'CheckIn carries personaName on the app path — a real identity must never ' +
        'reach a prompt (GDPR decision 1).',
    );
  }
  assertNoDirectIdentifier(checkIn);
}

