import type { EquipmentItem } from '@/features/equipment/equipment';

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

/** The answers an athlete gave during MCQ onboarding (slice 09 writes these). */
export interface Onboarding {
  sportBackground?: string | string[] | null;
  weeklyHours?: string | null;
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
 * Everything a check-in carries into a prompt. The numeric readiness scores are
 * required; the rest describe the athlete's phase, profile and preferences and
 * are optional because a brand-new athlete has few of them.
 */
export interface CheckIn {
  body: number;
  mental: number;
  energy: number;
  sleep: number;
  pulse: number;
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

/** Anything shaped like `local@domain` — the cheapest tell of a leaked email. */
const EMAIL_SHAPED = /[^\s@]+@[^\s@]+/;

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

/**
 * Walks every nested string leaf of an app-assembled prompt input looking for an
 * email shape, and throws if one is found (GDPR decision 1 / ADR 0006).
 *
 * The same runtime guarantee {@link assertNoIdentity} makes for a check-in,
 * exposed for any prompt builder that assembles its own material from an
 * athlete's opaque record — the Coach Briefing (slice 13) is the second caller.
 * The walk is deep because an identifier realistically hides in a free-text leaf
 * (an onboarding answer, a session note), not the top-level scalars.
 */
export function assertNoDirectIdentifier(value: unknown): void {
  if (typeof value === 'string') {
    if (EMAIL_SHAPED.test(value)) {
      throw new Error(
        'Prompt input carries an email-shaped value — no direct identifier may ' +
          'reach a prompt (GDPR decision 1).',
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertNoDirectIdentifier);
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(assertNoDirectIdentifier);
  }
}
