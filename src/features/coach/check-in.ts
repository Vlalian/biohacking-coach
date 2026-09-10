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
/**
 * How the athlete arrives at the week.
 *
 * **Split by who can honestly supply it** (Mads, 2026-09-09,
 * `training-architecture/05`). The first three are the Check-in: the athlete
 * reports them once a week, in words they choose, and all three are required —
 * half a Check-in is not a Check-in, which is why this is one nested object
 * rather than loose optional fields on {@link CheckIn}.
 *
 * The rest are **optional because nothing currently produces them**, not because
 * they are less important. Sleep duration and resting heart rate are expected to
 * arrive from a device (Garmin or similar) rather than from a weekly question —
 * asking an athlete to measure a resting pulse every Monday is a worse product
 * than reading one that was already measured. `mental` comes from Session
 * Reflection ratings, which flow already: the mind dimension is rated per
 * session, so asking for it again in the Check-in would be asking twice.
 *
 * They are kept here, unset, rather than deleted, because this is the shape the
 * feed lands into — and because the prompt has to keep saying the Coach cannot
 * see them until it does.
 *
 * `sleep` is deliberately two fields. It used to be one, rendered `sleep=7h`, so
 * reusing it for a 1–10 quality score would tell the Coach a number of hours the
 * athlete never gave. Quality and duration are different facts.
 */
export interface Readiness {
  /** Perceived energy, 1–10. Check-in. */
  energy: number;
  /** Physical condition, 1–10. Check-in. */
  body: number;
  /** Sleep quality, 1–10 — how it felt, not how long it was. Check-in. */
  sleepQuality: number;
  /** Hours slept. From a device; absent until there is a feed. */
  sleepHours?: number;
  /** Resting heart rate, bpm. From a device; absent until there is a feed. */
  restingPulse?: number;
  /** Mind, 1–10. Derived from Session Reflection ratings, not asked here. */
  mental?: number;
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
 * The stored Check-in as the prompt's {@link Readiness}, or null when the
 * athlete did not file one.
 *
 * The device-sourced halves are left **absent**, not defaulted: there is no feed
 * yet, and a zero or a plausible-looking 7h would read to the Coach as something
 * measured. `mental` is absent here too — it comes from Session Reflection
 * ratings, which reach the prompt by their own path.
 */
export function readinessFrom(
  row: { energy: number; body: number; sleepQuality: number } | null,
): Readiness | null {
  if (!row) return null;
  return { energy: row.energy, body: row.body, sleepQuality: row.sleepQuality };
}

/**
 * The athlete's own sentence about their week, trimmed to nothing-or-something.
 *
 * Deliberately **not** part of {@link readinessFrom}: `Readiness` is scores, and
 * a sentence is not a score. Keeping them apart is what stops the free text
 * being rendered as a number or averaged into one.
 *
 * An empty string becomes null, because a blank line in a prompt reads to the
 * model as a signal the athlete gave and left empty.
 */
export function notableSignalFrom(row: { notableSignal: string | null } | null): string | null {
  const signal = row?.notableSignal?.trim();
  return signal ? signal : null;
}

/**
 * Everything a check-in carries into a prompt.
 *
 * `readiness` is optional because the Weekly Session is not a gate (ADR 0007):
 * an athlete may skip the Check-in, and most weeks many will. Absent means the
 * prompts render the STATE line without scores and tell the Coach to ask,
 * rather than inventing a number (code-health/07). It is one nested object
 * rather than loose optional fields precisely so "half a readiness" cannot be
 * constructed: a partial one would render as no readiness at all *and* have the
 * prompt tell the model there is none — a false claim in the opposite direction.
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
  /**
   * The Race Distance the athlete trains for. `undefined` means never asked —
   * every athlete who onboarded before the question existed — and the prompt
   * says so, because a missing distance and a known one are different claims.
   */
  raceDistance?: string | null;
  /** The Target Race's date, `YYYY-MM-DD`, or absent when there is no race. */
  raceDate?: string | null;
  /**
   * Where in the current Training Block the athlete is standing, already
   * rendered ("week 2 of 8"). Absent when there is no horizon to be inside.
   * Which block is not enough on its own — its first week and its last call for
   * different sessions.
   */
  blockWeek?: string | null;
  /**
   * What an open Injury or Illness prevents, already rendered as a sentence by
   * `features/health/capacity.ts`. Absent when nothing is restricted.
   *
   * A **string**, not a structure, and deliberately so: this is the only half of
   * a health record that may reach a prompt (ADR 0011), and passing the rendered
   * sentence rather than the records means nothing downstream of here is holding
   * anything it could accidentally serialize. There is no field on this type for
   * a detail thread, a body location, or a diagnosis — and no way to add one
   * without deleting this comment.
   */
  capacity?: string | null;
  /**
   * The one part of a Check-in the athlete writes in their own words, or absent
   * when they wrote nothing.
   *
   * It reaches the Coach verbatim, and that is deliberate: the three scores say
   * how the week feels in numbers, and this says the thing a number cannot.
   * Because it is free text it passes {@link assertNoDirectIdentifier} with
   * every other free-text leaf, and the field's own label tells the athlete the
   * Coach reads it (ADR 0011's 2026-09-10 amendment).
   */
  notableSignal?: string | null;
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

