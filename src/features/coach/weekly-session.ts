import type { Athlete } from '@/features/athlete/athlete';
import type { EquipmentItem } from '@/features/equipment/equipment';
import { isImportedHistory, isUnrecorded, type Session } from '@/features/session/session';
import { coachHowToFrom, cueFrom, type HowTo, type StoredHowTo } from '@/features/session/how-to';
import { isFreeOfShapedIdentifiers } from '@/lib/identifiers';
import { HOW_TO_SPORTS, type HowToSport } from '@/features/session/how-to-templates';
import type { NewSessionRow, RaceRow } from '@/db/schema';
import { addDays, dateKey, isValidDateKey, weekStartOf } from '@/lib/date';
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
import type { PresenceStage } from './presence';

/**
 * The pure logic behind planning a week — the deterministic seam between the
 * app's data and the Coach's prompts. Everything here is plain data in, plain
 * data out: no DB, no HTTP, no Anthropic client. The services wire these to the
 * repositories and the adapter.
 *
 * Named for the Weekly Session that first owned it; that behavior is retired
 * (ADR 0007, amended 2026-09-16) and what remains here is what outlived it: the
 * check-in the prompts reason about, the `propose_week_plan` tool and its
 * validation, and the week's feedback and skips as the prompts read them.
 *
 * The load-bearing rule of ADR 0006 / GDPR decision 1 lives here: {@link
 * buildWeeklyCheckIn} assembles a check-in from the opaque athlete profile and
 * never touches a name or an email, so no direct identifier can reach a prompt.
 */

// `Readiness` now lives beside `CheckIn` in `check-in.ts` — it is check-in data,
// and nesting it there is what makes a half-filled readiness unconstructible.
// Re-exported here because this is where callers have always imported it from.
export type { Readiness };

/**
 * Assembles the check-in the Coach prompts reason about, from the athlete's
 * opaque profile and today's reported readiness.
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
  /** Where the Presence Arc stands, read from stored data (`presence-repository`). */
  presenceStage: PresenceStage,
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
    // Coaching-relationship depth, as the Presence Arc reads it from data —
    // never the athlete's weekly frequency, which would mislabel a cadence
    // (6/week) as history.
    presenceStage,
    language: language ?? 'en',
    // Equipment lives in its own table (its own screen, its own CRUD), not on
    // the athlete row — the caller fetches it and passes it in.
    equipment: equipmentItems,
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

/**
 * One past week, as the weekly draft reads it (`training-architecture/44`):
 * minutes planned against minutes done, sessions completed and skipped, and
 * what was done split by Session Type. Discipline (swim/bike/run) is not
 * stored anywhere, so the split is by type.
 */
export interface WeekSummary {
  weekStart: string;
  plannedMinutes: number;
  doneMinutes: number;
  completed: number;
  skipped: number;
  byType: { type: string; completed: number; doneMinutes: number }[];
  /**
   * The week holds today, so it is only part-way through: what is still to
   * come is left out rather than read as not done.
   */
  soFar: boolean;
  /**
   * How many of the completed sessions are imported history — a History
   * Upload's, which needs no rating (`garmin-integration/07`). Counted within
   * `completed`, so the Coach reads them as done and never as unrated.
   */
  imported: number;
  /**
   * Past Planned Sessions nobody recorded (`training-architecture/45`) — in
   * `plannedMinutes`, never in `completed` or `skipped`, and said as such so
   * the Coach does not read them as done or as dropped.
   */
  unrecorded: number;
  /**
   * What a device recorded on the week's completed sessions
   * (`training-architecture/52`): distance summed, average heart rate the mean
   * of the sessions that had one. Null when none of them came with a summary.
   */
  device: { distanceKm: number; avgHr: number | null } | null;
}

/** How many weeks before the drafted one the draft reads. */
export const RECENT_WEEKS = 4;

/**
 * The four weeks before `targetWeekStart`, oldest first — a week with nothing
 * in it is returned empty rather than dropped, so the Coach reads a gap as a
 * gap. Done means `status = 'completed'` whatever wrote the session: a
 * Detected Activity accept keeps `'athlete'` or the planned session's origin,
 * and a History Upload writes `'garmin'` — counted as done and as
 * {@link WeekSummary.imported}, never as a reflection missing.
 *
 * The draft is written days before its week starts, so the last of the four is
 * usually the current one. A session from today on that is neither completed
 * nor skipped has not had its chance yet: it is left out, and that week is
 * marked {@link WeekSummary.soFar}.
 */
export function fourWeekSummary(sessions: Session[], targetWeekStart: string, today: string): WeekSummary[] {
  const decided = sessions.filter((s) => s.date < today || s.status === 'completed' || s.status === 'skipped');
  return Array.from({ length: RECENT_WEEKS }, (_, i) => {
    const weekStart = addDays(targetWeekStart, (i - RECENT_WEEKS) * 7);
    const week = decided.filter((s) => weekStartOf(s.date) === weekStart);
    return summariseWeek(weekStart, week, weekStart === weekStartOf(today), today);
  });
}

function summariseWeek(weekStart: string, week: Session[], soFar: boolean, today: string): WeekSummary {
  const done = week.filter((s) => s.status === 'completed');
  return {
    weekStart,
    plannedMinutes: minutesOf(week),
    doneMinutes: minutesOf(done),
    completed: done.length,
    skipped: week.filter((s) => s.status === 'skipped').length,
    byType: typeSplit(done),
    soFar,
    imported: done.filter(isImportedHistory).length,
    unrecorded: week.filter((s) => isUnrecorded(s, today)).length,
    device: deviceOf(done),
  };
}

/** The device facts of a week's completed sessions, or null when none carried any. */
function deviceOf(done: Session[]): WeekSummary['device'] {
  const summaries = done.flatMap((s) => (s.summary ? [s.summary] : []));
  if (summaries.length === 0) return null;
  const metres = summaries.reduce((sum, x) => sum + (x.distanceM ?? 0), 0);
  const rates = summaries.flatMap((x) => (x.avgHr === null ? [] : [x.avgHr]));
  return {
    distanceKm: Math.round(metres / 100) / 10,
    avgHr: rates.length === 0 ? null : Math.round(rates.reduce((a, b) => a + b, 0) / rates.length),
  };
}

/** What was done, by Session Type, in the order each type first appeared. */
function typeSplit(done: Session[]): WeekSummary['byType'] {
  const types = [...new Set(done.map((s) => s.type))];
  return types.map((type) => {
    const ofType = done.filter((s) => s.type === type);
    return { type, completed: ofType.length, doneMinutes: minutesOf(ofType) };
  });
}

function minutesOf(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0);
}

/** The week's skipped sessions as natural date + type references (no ids). */
export function skippedFrom(sessions: Session[]): SkippedSession[] {
  return sessions
    .filter((s) => s.status === 'skipped')
    .map((s) => ({ date: s.date, sessionType: s.type }));
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
  /**
   * The discipline (`training-architecture/26`, E4): the arithmetic's for that
   * day unless Momentum stated a reason to change it. Absent on a session
   * nothing gave a sport, and on every draft stored before the field existed.
   */
  sport?: HowToSport;
  /** Momentum's reason for a sport the arithmetic did not have on that day. */
  sportReason?: string;
  /** Momentum's one personal cue on how to do this session (E5). */
  cue?: string;
  /** The Head Coach's own how-to, set in their review of the draft (E6: final). */
  coachHowTo?: HowTo;
}

/**
 * The athlete's standing no-train weekdays, or none. One place for the
 * `?? []`, because every window derivation needs it and each copy carried the
 * same equivalent mutant (`training-architecture/20`).
 */
export function fixedConstraintsOf(athlete: Pick<Athlete, 'profile'>): string[] {
  // Stryker disable next-line LogicalOperator,ArrayDeclaration: equivalent. A
  // Fixed Constraint is matched by weekday name, so a non-weekday default
  // matches no day and yields the same window as an empty one; and `||` and
  // `??` agree on an array, which is never falsy.
  return athlete.profile?.fixedConstraints ?? [];
}

export const PROPOSE_WEEK_PLAN_TOOL_NAME = 'propose_week_plan';

/**
 * The tool the Coach calls to *propose* a training week — it never writes. A tool
 * call stages a proposal the athlete then confirms or cancels; the server is the
 * authority on what actually lands (ADR 0006). Dates are explicit, so a plan
 * can name the window's days exactly, which a weekday-only shape could not; the
 * window itself is the server's choice (`training-architecture/20`), never the
 * tool's to widen. `strict` makes
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
    'rest days entirely. Every date must fall inside the PLANNING WINDOW you were ' +
    'given; the server drops any date outside it.',
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
            sport: {
              type: 'string',
              enum: [...HOW_TO_SPORTS],
              description:
                "The discipline. Keep the baseline week's sport for that day; the server keeps it unless you give sportReason.",
            },
            sportReason: {
              type: 'string',
              description:
                "Only when sport differs from the baseline week's on that day: the athlete's reason, in their language (e.g. 'knee: run → bike').",
            },
            cue: {
              type: 'string',
              description:
                "Optional: one sentence, at most 140 characters, in the athlete's language, on how this athlete should do this session. The app adds the structure and the standard cues; do not repeat them.",
            },
          },
          required: ['date', 'type', 'durationMinutes', 'zone', 'note'],
        },
      },
      whatChanged: {
        type: 'string',
        description:
          "When you changed the week you were given, one sentence in the athlete's language on what you changed. Leave it out when you changed nothing.",
      },
      volumeReason: {
        type: 'string',
        description:
          "Only when the week's total minutes are more than 10% below the baseline week: the athlete's reason for the larger cut (injury, illness, fatigue they reported). The server allows at most 30% below with a reason, 10% without, and never more than 10% above.",
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

/**
 * The Coach's one sentence on what it changed in the week it was given
 * (`training-architecture/40`), or null when it gave none. Optional in the
 * tool, so an absent, blank or non-string value is simply no sentence.
 */
export function whatChangedFrom(input: unknown): string | null {
  return optionalString((input as { whatChanged?: unknown } | null | undefined)?.whatChanged)?.trim() ?? null;
}

/**
 * The stated reason for cutting the arithmetic's volume by more than 10 %
 * (`training-architecture/48`, R1), or null when the Coach gave none.
 */
export function volumeReasonFrom(input: unknown): string | null {
  return optionalString((input as { volumeReason?: unknown } | null | undefined)?.volumeReason)?.trim() ?? null;
}

/** The band around the arithmetic's minutes a draft may land in (R1). */
const BAND = { below: 0.9, belowWithReason: 0.7, above: 1.1 } as const;

/** How far a week may move before it counts as adjusted (R4). */
const ADJUSTED_VOLUME = 0.05;

function totalMinutes(sessions: readonly { durationMinutes: number | null }[]): number {
  return sessions.reduce((sum, x) => sum + (x.durationMinutes ?? 0), 0);
}

/** A clamped session's minutes: rounded to five, never under fifteen (R2). */
function fitMinutes(minutes: number): number {
  return Math.max(15, Math.round(minutes / 5) * 5);
}

/**
 * The draft held to the band around the arithmetic's volume
 * (`training-architecture/48`, Mads's rulings R1 and R2, 2026-09-29).
 *
 * Within ±10 % the draft stands as it is. It may go down to −30 % only with a
 * stated reason, and never above +10 %, reason or not. Outside the band every
 * session's minutes are scaled by the same factor back to the nearest edge,
 * rounded to five minutes and kept at fifteen or more — so the draft is never
 * lost, only its volume is brought back. The edge is taken at the five-minute
 * mark inside the band, and the longest session absorbs what the rounding and
 * the fifteen-minute floor added or took, so the week lands on that mark
 * rather than just outside it. A week the arithmetic wrote nothing for has no
 * band, and a week with no minutes has nothing to scale.
 */
export function clampToBand(
  sessions: ProposedSession[],
  baselineMinutes: number,
  reason: string | null,
): { sessions: ProposedSession[]; total: number; clamped: boolean } {
  const total = totalMinutes(sessions);
  const floor = baselineMinutes * (reason ? BAND.belowWithReason : BAND.below);
  const ceiling = baselineMinutes * BAND.above;
  if (standsAsIs(total, baselineMinutes, floor, ceiling)) return { sessions, total, clamped: false };
  const goal = Math.min(Math.max(total, Math.ceil(floor / 5) * 5), Math.floor(ceiling / 5) * 5);
  const scaled = sessions.map((x) =>
    x.durationMinutes === null ? x : { ...x, durationMinutes: fitMinutes(x.durationMinutes * (goal / total)) },
  );
  const held = settledOn(goal, scaled);
  return { sessions: held, total: totalMinutes(held), clamped: true };
}

/** No arithmetic to hold it to, no minutes to scale, or already inside the band. */
function standsAsIs(total: number, baselineMinutes: number, floor: number, ceiling: number): boolean {
  return baselineMinutes === 0 || total === 0 || (total >= floor && total <= ceiling);
}

/**
 * The scaled week brought to `goal`. Minutes the rounding took are given back to
 * the longest session. Minutes it added are taken back five at a time, each from
 * the longest session still over fifteen, so no single session is floored while
 * others could give (CodeRabbit, PR #116). When every session is already at
 * fifteen the floor (R2) wins and the week stays over: the draft is never lost.
 */
function settledOn(goal: number, sessions: ProposedSession[]): ProposedSession[] {
  const minutes = sessions.map((x) => x.durationMinutes ?? 0);
  const rest = goal - totalMinutes(sessions);
  // Stryker disable next-line EqualityOperator — at rest 0 adding 0 and trimming 0 are the same.
  if (rest > 0) minutes[minutes.indexOf(Math.max(...minutes))] += rest;
  else trimFromLongest(minutes, -rest);
  return sessions.map((x, i) => (x.durationMinutes === null ? x : { ...x, durationMinutes: minutes[i] }));
}

/** Takes `over` minutes off, five at a time from the longest session above fifteen. */
function trimFromLongest(minutes: number[], over: number): void {
  for (let left = over; left > 0; left -= 5) {
    const longest = Math.max(...minutes);
    if (longest <= 15) return;
    minutes[minutes.indexOf(longest)] -= 5;
  }
}

/** The (date, Session Type) pairs of a week, in date order, as one comparable key. */
function shapeOf(sessions: readonly { date: string; type: string }[]): string {
  return JSON.stringify(sessions.map((x) => [x.date, x.type]).sort());
}

/**
 * Whether the draft really differs from the arithmetic's week (R4): a session
 * added, removed, moved or retyped, or the volume moved by more than 5 %.
 * Internal — stored for statistics, never shown to the athlete or the coach.
 * The Coach's own flag said "adjusted" whenever a baseline existed, and a
 * draft that copied the arithmetic to the minute claimed an adjustment (the
 * 2026-09-26 audit). No arithmetic week is nothing to adjust.
 */
export function isAdjusted(
  draft: readonly { date: string; type: string; durationMinutes: number | null }[],
  baseline: readonly { date: string; type: string; durationMinutes: number | null }[],
): boolean {
  if (baseline.length === 0) return false;
  if (shapeOf(draft) !== shapeOf(baseline)) return true;
  const base = totalMinutes(baseline);
  return Math.abs(totalMinutes(draft) - base) > base * ADJUSTED_VOLUME;
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
export function validateProposedPlan(
  input: unknown,
  window: PlanningWindow,
  /**
   * `coachHowTo: true` only where a Head Coach's edit can be on the input: the
   * approval, and the athlete's accept of an approved draft. Momentum's tool
   * input never carries the coach's text, whatever it sends.
   */
  { coachHowTo = false }: { coachHowTo?: boolean } = {},
): ValidatePlanResult {
  const raw = sessionsArrayFrom(input);
  if (!raw) return { ok: false, reason: 'malformed' };

  const sessions = raw
    .map((entry) => proposedSessionFrom(entry, window, coachHowTo))
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
function proposedSessionFrom(entry: unknown, window: PlanningWindow, coachHowTo: boolean): ProposedSession | null {
  // Stryker disable next-line ConditionalExpression: equivalent. Dropping the
  // typeof half changes nothing observable - a primitive's `.date` is undefined,
  // and isPlannableDay refuses that on the very next line. The guard earns its
  // place against `null`, which would throw, and that half IS killed by a test.
  if (!entry || typeof entry !== 'object') return null;
  const s = entry as Record<string, unknown>;

  if (!isPlannableDay(s.date, window)) return null;
  if (!isPlanType(s.type)) return null;

  const session: ProposedSession = {
    date: s.date,
    type: s.type,
    durationMinutes: positiveMinutes(s.durationMinutes),
    zone: optionalString(s.zone),
    note: optionalString(s.note),
    ...howToFieldsOf(s),
  };
  return coachHowTo ? withCoachHowTo(session, s.coachHowTo) : session;
}

/** Momentum's sport, its reason and its cue, each only when it has a usable value (`training-architecture/26`). */
function howToFieldsOf(s: Record<string, unknown>): Pick<ProposedSession, 'sport' | 'sportReason' | 'cue'> {
  return presentOnly({ sport: howToSportOf(s.sport), sportReason: sportReasonFrom(s.sportReason), cue: cueFrom(s.cue) });
}

/**
 * Momentum's reason for a sport swap, trimmed, or null. A reason carrying a
 * shaped identifier is dropped like a cue, and the swap reverts with it: a
 * staged week is walked by the chat prompt's identifier assertion, and a
 * reason kept here would refuse every later chat turn.
 */
function sportReasonFrom(value: unknown): string | null {
  const reason = optionalString(value)?.trim() ?? null;
  return isFreeOfShapedIdentifiers(reason) ? reason : null;
}

/**
 * The session with the Head Coach's how-to, or null when they sent one that
 * does not fit it — refused as a whole, like any other bad row of theirs.
 */
function withCoachHowTo(session: ProposedSession, raw: unknown): ProposedSession | null {
  if (raw === undefined || raw === null) return session;
  const howTo = coachHowToFrom(raw, session.durationMinutes);
  return howTo && { ...session, coachHowTo: howTo };
}

/**
 * The fields that have a value. The optional fields are left off rather than
 * set to null, so a session that never had them — every draft stored before
 * `training-architecture/26` — reads back exactly as it was written.
 */
function presentOnly<T extends Record<string, unknown>>(fields: T): Partial<{ [K in keyof T]: NonNullable<T[K]> }> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined)) as Partial<{
    [K in keyof T]: NonNullable<T[K]>;
  }>;
}

function howToSportOf(value: unknown): HowToSport | null {
  return (HOW_TO_SPORTS as readonly unknown[]).includes(value) ? (value as HowToSport) : null;
}

/**
 * The sport a drafted session keeps (`training-architecture/26`, E4): the
 * arithmetic's for that day by default. Momentum's own choice stands when it
 * matches one of the arithmetic's sessions that day, when it gave a reason, or
 * on a day the arithmetic wrote no known sport for.
 */
function sportOf(
  session: Pick<ProposedSession, 'sport' | 'sportReason'>,
  arithmeticDay: readonly { sport: string }[],
): HowToSport | undefined {
  const planned = knownSports(arithmeticDay);
  if (session.sport && (planned.includes(session.sport) || session.sportReason)) return session.sport;
  return planned[0] ?? session.sport;
}

/** The known sports among a day's arithmetic sessions, in order. */
function knownSports(day: readonly { sport: string }[]): HowToSport[] {
  return day.map((x) => howToSportOf(x.sport)).filter((x): x is HowToSport => x !== null);
}

/**
 * A proposed week held to the arithmetic's sports day by day, and one line per
 * swap Momentum explained, for `whatChanged` (E4: the reason shows in the draft
 * and in the coach's review). A reason on a session whose sport did not change
 * explains nothing and is dropped.
 */
export function withArithmeticSports(
  sessions: ProposedSession[],
  baseline: readonly { date: string; sport: string }[],
): { sessions: ProposedSession[]; swaps: string[] } {
  const swaps: string[] = [];
  const held = sessions.map((session) => {
    const day = baseline.filter((x) => x.date === session.date);
    const sport = sportOf(session, day);
    const planned = knownSports(day);
    // sportOf keeps a sport the arithmetic did not have only with a reason.
    const swapped = planned.length > 0 && !planned.includes(sport as HowToSport);
    if (swapped) swaps.push(`${session.date}: ${planned[0]} → ${sport} (${session.sportReason})`);
    const rest = { ...session };
    delete rest.sport;
    delete rest.sportReason;
    return { ...rest, ...presentOnly({ sport, sportReason: swapped ? session.sportReason : undefined }) };
  });
  return { sessions: held, swaps };
}

/** Momentum's sentence on what changed, with the explained sport swaps after it. */
export function withSwaps(whatChanged: string | null, swaps: string[]): string | null {
  if (swaps.length === 0) return whatChanged;
  const lines = swaps.join('; ');
  return whatChanged ? `${whatChanged} ${lines}` : lines;
}

/**
 * Whether an untrusted value is a day the server will write.
 *
 * A real calendar day, inside the window — before it is history, or a week that
 * was not being planned; after it is a week nobody agreed to. Takes `unknown`
 * and narrows, so there is no sentinel empty string standing in for "not a
 * date": absence and invalidity are the same refusal and are written once.
 */
export function isPlannableDay(date: unknown, window: PlanningWindow): date is string {
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
      ...presentOnly({ sport: s.sport, howTo: storedHowToOf(s) }),
    };
  });
}

/** What was written about how to do it, as `sessions.how_to` stores it; null when nothing was. */
function storedHowToOf(s: ProposedSession): StoredHowTo | null {
  const stored = presentOnly({ cue: s.cue, coach: s.coachHowTo });
  return Object.keys(stored).length > 0 ? stored : null;
}
