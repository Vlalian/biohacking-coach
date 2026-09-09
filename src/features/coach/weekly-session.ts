import type { Athlete } from '@/features/athlete/athlete';
import type { EquipmentItem } from '@/features/equipment/equipment';
import type { Session } from '@/features/session/session';
import type { NewSessionRow } from '@/db/schema';
import { isValidDateKey } from '@/lib/date';
import type { PlanningWindow } from './planning-window';
import { assertNoIdentity, type CheckIn, type Readiness, type SkippedSession, type WeekFeedbackEntry } from './check-in';
import type { CoachMessage } from './coach-client';
import { toApiMessages, type Message } from './conversation';

/**
 * The Weekly Session's pure orchestration logic — the deterministic seam between
 * the app's data and the Coach's prompts. Everything here is plain data in, plain
 * data out: no DB, no HTTP, no Anthropic client. The server action wires these to
 * the repository and the adapter.
 *
 * The load-bearing rule of ADR 0006 / GDPR decision 1 lives here: {@link
 * buildWeeklyCheckIn} assembles a check-in from the opaque athlete profile and
 * never touches a name or an email, so no direct identifier can reach a prompt.
 */

// `Readiness` now lives beside `CheckIn` in `check-in.ts` — it is check-in data,
// and nesting it there is what makes a half-filled readiness unconstructible.
// Re-exported here because this is where callers have always imported it from.
export type { Readiness };

/** The user-turn primer that opens a Weekly Session (never persisted). */
export const WEEKLY_OPENER = "Let's do our weekly session.";

/**
 * Assembles the check-in the Weekly Session prompt reasons about, from the
 * athlete's opaque profile and today's reported readiness.
 *
 * `readiness` is nullable because until a Check-in feature exists the athlete
 * has never reported one. Null means the five scores are *left out entirely* —
 * not defaulted — so the prompt renders a STATE line without them and tells the
 * Coach to ask instead. Inventing a neutral baseline made every athlete read as
 * equally, mildly fine, and contradicted anyone who said otherwise in words
 * (code-health/07).
 *
 * No name, email, DOB or location is read here — only the opaque profile columns
 * and the onboarding answers. `personaName` is deliberately left unset: the
 * prompt never carries a real identity (GDPR decision 1). The result is passed
 * through {@link assertNoIdentity}, so the guarantee is enforced, not merely
 * intended.
 *
 * `language` arrives as a parameter because it lives on the user (`ui_prefs`,
 * ticket 09), not in training data — the caller reads it through the user seam.
 * Defaults to English until onboarding sets it.
 */
export function buildWeeklyCheckIn(
  athlete: Athlete,
  readiness: Readiness | null,
  weeklySessionNumber: number,
  language?: string,
  equipmentItems: EquipmentItem[] = [],
  /**
   * The Target Race, or null when the athlete has none.
   *
   * A parameter rather than an athlete column because a Race is an entity — the
   * caller reads it through the race repository, the same way `language` comes
   * through the user seam. Both halves come from here so the prompt never
   * reports a name from one source beside a date from another: `athlete.raceTarget`
   * is kept in step by every writer, but "kept in step" is a promise, and the
   * Race row is the fact.
   */
  targetRace: { name: string; date: string } | null = null,
): CheckIn {
  const checkIn: CheckIn = {
    // Omitted entirely when absent, rather than set to undefined: nothing can
    // then interpolate "undefined" into a prompt.
    ...(readiness ? { readiness } : {}),
    ...coachingFactsFrom(athlete),
    ...(targetRace ? { raceTarget: targetRace.name, raceDate: targetRace.date } : {}),
    ...constraintFactsFrom(athlete),
    // The STATE line's `sessions=` is coaching-relationship depth — how many
    // Weekly Sessions have come before, not the athlete's weekly frequency.
    // Mapping `trainingSessionsPerWeek` here would mislabel a cadence (6/week)
    // as history (6 sessions had), so relationship depth is used instead.
    sessionCount: Math.max(0, weeklySessionNumber - 1),
    language: language ?? 'en',
    // Equipment lives in its own table (its own screen, its own CRUD), not on
    // the athlete row — the caller fetches it and passes it in.
    equipment: equipmentItems,
    weeklySessionNumber,
  };
  assertNoIdentity(checkIn);
  return checkIn;
}

/**
 * The athlete's coaching picture, as the prompt names it.
 *
 * Every column is nullable and every one becomes `undefined` rather than a
 * stand-in, because {@link assertNoIdentity} and the prompt builders both treat
 * absence as a thing to omit — a defaulted value would read to the Coach as
 * something the athlete said.
 */
function coachingFactsFrom(athlete: Athlete) {
  return {
    phase: orUndefined(athlete.trainingPhase),
    experienceLevel: orUndefined(athlete.experienceLevel),
    commStyle: orUndefined(athlete.communicationStyle),
    raceTarget: orUndefined(athlete.raceTarget),
    raceDistance: orUndefined(athlete.raceDistance),
  };
}

/**
 * A nullable column as an optional field.
 *
 * `null` and `undefined` mean the same thing to every reader of a `CheckIn` -
 * the athlete has not said - but only `undefined` is omitted by object spread
 * and by the prompt builders' `tag()`. One conversion, written once, so that
 * "absent" has a single spelling on the way into a prompt.
 */
function orUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

/**
 * The answers MCQ onboarding wrote (slice 09), read straight off the opaque
 * profile: the onboarding block, the no-training days, and the preferred Weekly
 * Session day. No column here can carry a name or an email.
 */
function constraintFactsFrom(athlete: Athlete) {
  const profile = athlete.profile;
  return {
    onboarding: orUndefined(profile?.onboarding),
    fixedConstraints: orUndefined(profile?.fixedConstraints),
    weeklySessionDay: orUndefined(profile?.weeklySessionDay),
  };
}

/**
 * A Session Reflection is two 1–5 smiley scores; the weekly feedback summary
 * speaks in tenths. Maps 1→1 and 5→10 linearly so the Coach reads one consistent
 * scale.
 */
export function reflectionScoreToTen(v: number): number {
  return Math.round(1 + ((v - 1) * 9) / 4);
}

/**
 * The week's Session Reflections as the Coach's feedback summary. Reads only
 * rated sessions — an unrated session contributes nothing — so this is exactly
 * "the Coach reads the athlete's Session Reflections when reviewing".
 */
export function weekFeedbackFrom(sessions: Session[]): WeekFeedbackEntry[] {
  return sessions
    .filter((s) => s.feedbackBody !== null && s.feedbackMind !== null)
    .map((s) => ({
      dateKey: s.date,
      sessionType: s.type,
      body: reflectionScoreToTen(s.feedbackBody as number),
      mind: reflectionScoreToTen(s.feedbackMind as number),
      comment: s.feedbackComment,
    }));
}

/** The week's skipped sessions as natural date + type references (no ids). */
export function skippedFrom(sessions: Session[]): SkippedSession[] {
  return sessions
    .filter((s) => s.status === 'skipped')
    .map((s) => ({ date: s.date, sessionType: s.type }));
}

/**
 * Renders a stored transcript into the alternating user/assistant history the
 * Anthropic API expects. The Coach speaks first in a Weekly Session, so a fixed
 * user-turn primer opens the history; it is a prompt device, never persisted.
 */
export function toWeeklyApiMessages(transcript: Message[]): CoachMessage[] {
  return toApiMessages(transcript, WEEKLY_OPENER);
}

// ── The Week Plan proposal tool ───────────────────────────────────────────────

/**
 * The session types the Coach may propose. A rest day carries no session — the
 * calendar shows it as the absence of one — so 'Rest' is deliberately not a
 * value the tool can emit.
 */
export const PLAN_TYPES = ['Endurance', 'Intensity', 'Tempo', 'Recovery'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/** One session the Coach proposes — a real date, not a weekday name. */
export interface ProposedSession {
  date: string;
  type: PlanType;
  durationMinutes: number | null;
  zone: string | null;
  note: string | null;
}

export const PROPOSE_WEEK_PLAN_TOOL_NAME = 'propose_week_plan';

/**
 * The tool the Coach calls to *propose* a training week — it never writes. A tool
 * call stages a proposal the athlete then confirms or cancels; the server is the
 * authority on what actually lands (ADR 0006). Dates are explicit, so a plan may
 * span any range the Coach and athlete agreed — including from today into the
 * following week, which a weekday-only shape could not express. `strict` makes
 * the API guarantee the input matches this schema, so there is no JSON parsing or
 * fence-stripping to get wrong.
 */
export const PROPOSE_WEEK_PLAN_TOOL = {
  name: PROPOSE_WEEK_PLAN_TOOL_NAME,
  description:
    'Propose the agreed training week to the athlete for confirmation. This does ' +
    'NOT save anything — it shows the plan to the athlete, who confirms or cancels. ' +
    'Call it only once the athlete has agreed to the plan, never while you are ' +
    'still offering options. Give every session an explicit calendar date; omit ' +
    'rest days entirely. The plan may cover any range you agreed, including from ' +
    'today into next week.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sessions: {
        type: 'array',
        description: 'The training sessions of the week, in day order. No rest days.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            date: { type: 'string', description: 'Calendar date, YYYY-MM-DD.' },
            type: { type: 'string', enum: [...PLAN_TYPES] },
            durationMinutes: { type: 'integer', description: 'Planned duration in minutes.' },
            zone: { type: 'string', description: 'Intensity zone, e.g. Z2.' },
            note: { type: 'string', description: 'One short coaching line.' },
          },
          required: ['date', 'type', 'durationMinutes', 'zone', 'note'],
        },
      },
    },
    required: ['sessions'],
  },
} as const;

const MAX_SESSION_MINUTES = 24 * 60;

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function positiveMinutes(value: unknown): number | null {
  // Stryker disable next-line ConditionalExpression: equivalent. The typeof is
  // here to narrow for TypeScript; at runtime Number.isInteger already refuses
  // every non-number, so no behavioural test can tell the two apart.
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_SESSION_MINUTES
    ? value
    : null;
}

export type ValidatePlanResult =
  | { ok: true; sessions: ProposedSession[] }
  | { ok: false; reason: 'malformed' | 'empty' };

/**
 * The server-authority gate over a proposed plan.
 *
 * `strict` tool use guarantees the shape, but not the meaning: the Coach could
 * still name an impossible date (2026-02-30), one in the past, or one in a week
 * it was never asked to plan. Each row is checked against the real calendar and
 * against the {@link PlanningWindow}; a row that fails is dropped rather than
 * trusted. `malformed` means the input was not even a sessions array; `empty`
 * means nothing valid survived — both are refusals, so nothing is staged. The
 * athlete only ever sees, and confirms, rows that passed here.
 *
 * The window replaced a bare `today` on 2026-09-03 (`showable-version/11`). The
 * old check bounded the plan below and not above, so a proposal for any future
 * week validated cleanly and `proposalDateRange` then wrote whatever span the
 * model had chosen — the rule that a plan covers the remainder of *this* week
 * lived only as a sentence in the prompt, and a sentence in a prompt is a
 * request. The window's own `start` subsumes the past-date rule: it is never
 * earlier than today.
 */
export function validateProposedPlan(
  input: unknown,
  window: PlanningWindow,
): ValidatePlanResult {
  const raw = sessionsArrayFrom(input);
  if (!raw) return { ok: false, reason: 'malformed' };

  const sessions = raw
    .map((entry) => proposedSessionFrom(entry, window))
    .filter((s): s is ProposedSession => s !== null);

  if (sessions.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, sessions };
}

/**
 * The `sessions` array out of the tool input, or `null` when there was not one.
 *
 * `malformed` and `empty` are different refusals and this is the seam between
 * them: nothing here judges a session, only whether the Coach sent a list at all.
 */
function sessionsArrayFrom(input: unknown): unknown[] | null {
  // Optional chaining rather than an explicit object guard: a primitive has no
  // `sessions` either, so the guard was a second way of saying the same thing —
  // and a branch nothing can distinguish is a branch no test can hold.
  const raw = (input as { sessions?: unknown } | null | undefined)?.sessions;
  return Array.isArray(raw) ? raw : null;
}

/**
 * One row of a proposal, or `null` when the Coach named something the server
 * will not write: a day that is not a real date, a day outside the window, or a
 * type that is not a Session Type.
 *
 * Split out of {@link validateProposedPlan} so the loop reads as "keep the rows
 * that survive" and the surviving rules live in one place. A dropped row is
 * silent by design — the plan the athlete confirms is only ever what passed.
 */
function proposedSessionFrom(
  entry: unknown,
  window: PlanningWindow,
): ProposedSession | null {
  // Stryker disable next-line ConditionalExpression: equivalent. Dropping the
  // typeof half changes nothing observable - a primitive's `.date` is undefined,
  // and isPlannableDay refuses that on the very next line. The guard earns its
  // place against `null`, which would throw, and that half IS killed by a test.
  if (!entry || typeof entry !== 'object') return null;
  const s = entry as Record<string, unknown>;

  if (!isPlannableDay(s.date, window)) return null;
  if (!isPlanType(s.type)) return null;

  return {
    date: s.date,
    type: s.type,
    durationMinutes: positiveMinutes(s.durationMinutes),
    zone: optionalString(s.zone),
    note: optionalString(s.note),
  };
}

/**
 * Whether an untrusted value is a day the server will write.
 *
 * A real calendar day, inside the window — before it is history, or a week that
 * was not being planned; after it is a week nobody agreed to. Takes `unknown`
 * and narrows, so there is no sentinel empty string standing in for "not a
 * date": absence and invalidity are the same refusal and are written once.
 */
function isPlannableDay(date: unknown, window: PlanningWindow): date is string {
  // Stryker disable next-line ConditionalExpression: equivalent. The typeof is
  // here to narrow for TypeScript; at runtime isValidDateKey already rejects a
  // non-string, so no behavioural test can tell the two apart.
  if (typeof date !== 'string' || !isValidDateKey(date)) return false;
  if (date < window.start || date > window.end) return false;
  // Inside the range is not the same as plannable. A Fixed Constraint's weekday
  // and an Unavailable Date both land here as concrete days, already resolved
  // by the window. Until 2026-09-09 only the `NO TRAINING ON:` prompt line
  // stood between the Coach and a day the athlete had ruled out, and
  // `showable-version/11` is the ticket that established a prompt line is a
  // request rather than a bound. This is that argument one level down.
  return !window.excludedDates.includes(date);
}

/** Whether an untrusted value is one of the Session Types a plan may hold. */
function isPlanType(type: unknown): type is PlanType {
  // Stryker disable next-line ConditionalExpression: equivalent. Same reason as
  // isPlannableDay - the typeof narrows for TypeScript, and `includes` already
  // refuses a non-string at runtime.
  return typeof type === 'string' && PLAN_TYPES.includes(type as PlanType);
}

/**
 * Maps validated proposed sessions to insertable rows.
 *
 * `dayOrder` follows array order within a single date, so a Double (two sessions
 * on one day) keeps the order the Coach agreed. Every row is `origin: 'coach'`
 * and `status: 'planned'`, so the write only ever replaces coach-planned days.
 */
export function proposedToNewSessionRows(
  sessions: ProposedSession[],
  athleteId: string,
): NewSessionRow[] {
  const orderByDate = new Map<string, number>();
  return sessions.map((s) => {
    const dayOrder = orderByDate.get(s.date) ?? 0;
    orderByDate.set(s.date, dayOrder + 1);
    return {
      athleteId,
      date: s.date,
      type: s.type,
      origin: 'coach',
      status: 'planned',
      duration: s.durationMinutes,
      zone: s.zone,
      note: s.note,
      dayOrder,
    };
  });
}
