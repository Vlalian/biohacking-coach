import type { Athlete } from '@/features/athlete/athlete';
import type { EquipmentItem } from '@/features/equipment/equipment';
import type { Session } from '@/features/session/session';
import type { NewSessionRow, RaceRow } from '@/db/schema';
import { dateKey, isValidDateKey } from '@/lib/date';
import {
  inTuneUpWindow,
  racesEnteredAfterPlan,
  tuneUpRaces,
  tuneUpWindow,
  TUNE_UP_EVE_EASY,
} from '@/features/race/races';
import type { PlanningWindow } from './planning-window';
import {
  assertNoIdentity,
  type CheckIn,
  type RaceMention,
  type Readiness,
  type SkippedSession,
  type WeekFeedbackEntry,
} from './check-in';
import { blockPosition, currentBlock, type TrainingBlock } from './training-blocks';
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
 * `readiness` is nullable because the athlete may skip the Check-in (ADR 0007),
 * and until a device feed exists the athlete
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
  /**
   * The day the prompt is being built for. Needed because the Training Phase is
   * no longer a stored string — it is the name of the Training Block today falls
   * inside, derived here on every read (`training-architecture/03`).
   */
  today: string,
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
  /**
   * What an open Injury or Illness prevents, already rendered
   * (`features/health/capacity.ts`), or null when nothing is restricted.
   *
   * A sentence rather than the records, because this is the only half of a
   * health record that may reach a prompt (ADR 0011) — the caller resolves it,
   * and nothing from here on is holding a detail thread it could leak.
   */
  capacity: string | null = null,
  /** The athlete's own sentence from this week's Check-in, or null. */
  notableSignal: string | null = null,
  /**
   * Every Race the athlete has, and when this week's plan was written
   * (`training-architecture/09`). Both default to "none", which renders none of
   * slice 09's lines — the same shape as `targetRace: null`.
   */
  // Stryker disable next-line ArrayDeclaration: equivalent. `raceFactsFrom`
  // finds the target by `isTarget`; an array of anything without that flag
  // behaves exactly as an empty one.
  races: readonly RaceRow[] = [],
  planWrittenAt: Date | null = null,
  /**
   * The athlete's Training Blocks, already resolved
   * (`training-block-service.ts:getResolvedBlocks`): the Coach-shaped set when
   * one exists, the arithmetic draft when not (`training-architecture/07`).
   *
   * Passed in rather than derived here, because since 07 the blocks are no
   * longer a function of `today` and the race alone — a stored set is a read.
   * This function stays pure; the caller resolves. A caller that cannot passes
   * `[]`, and the prompt then carries the race with no phase, which is honest.
   */
  // Stryker disable next-line ArrayDeclaration: equivalent. `currentBlock` finds
  // the block today falls inside; a junk element has no dates and matches no
  // day, so a mutated default yields the same "no phase" as an empty one.
  blocks: TrainingBlock[] = [],
): CheckIn {
  const checkIn: CheckIn = {
    // Omitted entirely when absent, rather than set to undefined: nothing can
    // then interpolate "undefined" into a prompt.
    ...(readiness ? { readiness } : {}),
    ...coachingFactsFrom(athlete),
    ...horizonFactsFrom(today, targetRace, blocks),
    ...raceFactsFrom(today, races, planWrittenAt),
    ...(capacity ? { capacity } : {}),
    ...(notableSignal ? { notableSignal } : {}),
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
 * The athlete's horizon: the Target Race, the Training Block today falls inside,
 * and where in that block they are standing.
 *
 * Its own function for the same reason {@link coachingFactsFrom} is — the
 * check-in is a record of facts from several sources, and each source assembling
 * itself keeps any one of them from turning the builder into a pile of
 * conditionals. The blocks arrive resolved (see `buildWeeklyCheckIn`); an
 * athlete with no race has no phase, which is a real state, and the prompt
 * renders it as no phase rather than as a guess.
 */
function horizonFactsFrom(
  today: string,
  targetRace: { name: string; date: string } | null,
  blocks: TrainingBlock[],
) {
  if (!targetRace) return {};
  const race = { raceTarget: targetRace.name, raceDate: targetRace.date };

  // A race in the past leaves the athlete with a race but no blocks — nothing
  // left to divide. They keep the race and lose the phase, which is the honest
  // rendering of that state.
  const block = currentBlock(today, blocks);
  if (!block) return race;

  // Position is never checked separately: it is derived from the block, so a
  // block without one cannot exist, and asking twice would suggest it could.
  const { week, weeks } = blockPosition(today, block);
  return { ...race, phase: block.name, blockWeek: `week ${week} of ${weeks}` };
}

/**
 * The athlete's other races, as the prompt names them (`training-architecture/09`).
 *
 * The Target Race is found among `races` by its flag rather than taken from the
 * `targetRace` parameter, because the pure race functions need its id and its
 * `createdAt`, and the parameter carries neither. Empty lists are omitted, not
 * rendered as "none": a plan without a tune-up is not deficient (glossary).
 *
 * The tune-up window is carried **only while today is inside it** — that is
 * the whole nag-prevention (Mads, 2026-09-11, option b), decided here at the
 * seam that knows today, so the prompt stays a pure renderer.
 */
function raceFactsFrom(
  today: string,
  races: readonly RaceRow[],
  planWrittenAt: Date | null,
): Pick<CheckIn, 'tuneUps' | 'lateRaces' | 'tuneUpWindow' | 'tuneUpEveEasy'> {
  const target = races.find((r) => r.isTarget);
  if (!target) return {};

  const tuneUps = tuneUpRaces(today, races, target).map(mention);
  const lateRaces = racesEnteredAfterPlan(races, target, planWrittenAt).map(mention);
  return {
    ...tuneUpFacts(tuneUps),
    ...(lateRaces.length > 0 ? { lateRaces } : {}),
    ...windowFacts(today, target, tuneUps.length),
  };
}

const mention = (r: RaceRow) => ({ name: r.name, date: r.date, distance: r.distance });

/** The tune-ups and the interview flag together, or neither. */
function tuneUpFacts(tuneUps: RaceMention[]): Pick<CheckIn, 'tuneUps' | 'tuneUpEveEasy'> {
  return tuneUps.length > 0 ? { tuneUps, tuneUpEveEasy: TUNE_UP_EVE_EASY } : {};
}

/**
 * The window, only while today is inside it and only when no tune-up exists —
 * once one is entered there is nothing left to suggest.
 */
function windowFacts(
  today: string,
  target: RaceRow,
  tuneUpCount: number,
): Pick<CheckIn, 'tuneUpWindow'> {
  if (tuneUpCount > 0) return {};
  const window = tuneUpWindow(dateKey(target.createdAt), target.date);
  return inTuneUpWindow(today, window) ? { tuneUpWindow: window } : {};
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
            durationMinutes: {
              type: 'integer',
              description: 'Planned duration in minutes.',
            },
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
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_SESSION_MINUTES
    ? value
    : null;
}

export type ValidatePlanResult =
  { ok: true; sessions: ProposedSession[] } | { ok: false; reason: 'malformed' | 'empty' };

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
export function validateProposedPlan(input: unknown, window: PlanningWindow): ValidatePlanResult {
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
function proposedSessionFrom(entry: unknown, window: PlanningWindow): ProposedSession | null {
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
