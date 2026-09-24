import type { Onboarding } from '@/features/coach/check-in';
import { RACE_DISTANCES, type RaceDistance } from '@/lib/race-distances';
import { isCalendarDate } from '@/lib/calendar-date';
import { deriveExperienceLevel, parsePastRace, type PastRace } from './past-races';
import { parsePreferredName } from '@/features/user-prefs/preferred-name';

/**
 * The MCQ onboarding flow as pure data and functions — ported from the POC's
 * `onboarding.js` (the specification per ticket 09), minus its DOM rendering.
 *
 * Three deliberate deviations from the POC, each pinned by a standing decision:
 *
 * - **A name step, but not the POC's** (rewritten 2026-09-18,
 *   `preferred-name/02`). This used to read "No name step": the athlete's name
 *   already lives on the better-auth user and no training table may carry one
 *   (ADR 0006). Both reasons still hold and neither is contradicted. The POC's
 *   step duplicated login identity into training data; the step that exists
 *   now asks a different question — *what should the Coach call you?* — and
 *   its answer is a Preferred Name the athlete chose, stored identity-side in
 *   `user.uiPrefs` by the action, **never in the answers below**. The flow
 *   validates the typed value and records only that the step was answered;
 *   nothing here reads `user.name`, and nothing is prefilled from it (Mads,
 *   2026-08-21: a one-tap default is the app choosing, not the athlete).
 *   Leaving it blank is an answer — the Coach stays nameless, as before.
 * - **No name in the Communication Style.** The POC interpolated the athlete's
 *   name into the `commStyle` string; that string is a training-table column and
 *   reaches prompts, so here it always says "The athlete" (GDPR decision 1).
 * - **No API-key field.** Retired by ADR 0006 — the key is a server secret.
 *
 * The Garmin-upload step is also omitted: upload landed as its own feature in
 * slice 06 and is reachable from the main page; the acceptance criteria for this
 * slice do not name it.
 */

export type OnboardingStepId =
  | 'language'
  | 'name'
  | 'pastRaces'
  | 'distance'
  | 'hours'
  | 'race'
  | 'adaptive'
  | 'constraints';

export const ONBOARDING_STEPS: OnboardingStepId[] = [
  'language',
  'name',
  'pastRaces',
  'distance',
  'hours',
  'race',
  'adaptive',
  'constraints',
];

export type ExperienceLevel = 'beginner' | 'intermediate' | 'veteran';

// Re-exported so the onboarding flow stays the one import site for callers that
// only care about the questionnaire. The list itself lives in `lib/` because
// `db/schema.ts` renders it into a CHECK constraint — see that module.
export { RACE_DISTANCES };
export type { RaceDistance };


/**
 * Everything the questionnaire collects. Partial while in progress — the answer
 * record doubles as the resume point: the first unanswered step is where an
 * interrupted onboarding picks back up.
 */
export interface OnboardingAnswers {
  /** UI locale code — 'en' or 'da'. Chosen first, applied immediately. */
  language?: string;
  /**
   * Derived from {@link pastRaces} (`training-architecture/35`), never asked:
   * 0 finished races → beginner, 1–3 → intermediate, 4+ → veteran.
   */
  experienceLevel?: ExperienceLevel;
  /** The races the athlete has finished — zero or more; `[]` is an answer. */
  pastRaces?: PastRace[];
  /**
   * Hours a week the athlete can realistically train, 1–30, asked and never
   * suggested (Mads, 2026-09-19: "A and only A"). The ceiling 34's arithmetic
   * sizes every week from.
   */
  hoursPerWeek?: number;
  /**
   * Asked of **every** athlete, always, and deliberately not a property of the
   * race: an athlete building toward an Ironman with nothing yet booked still
   * needs an Ironman-shaped week — the winter-base athlete of *Distancens
   * Arkitektur* §14.
   */
  raceDistance?: RaceDistance;
  /** The Target Race's name. Absent when {@link noRaceYet} is set. */
  raceTarget?: string;
  /** The Target Race's date, `YYYY-MM-DD`. Always present alongside a name. */
  raceDate?: string;
  /**
   * The athlete said they have no race yet — a **decision**, not an absent
   * answer, and the difference matters: "ready to start the next block" is as
   * valid a goal as a start line, and `nextStep` must be able to tell an athlete
   * who declined from one who has not been asked. The race step used to require
   * a non-empty name, so an athlete with nothing booked could not get past it
   * without inventing one.
   */
  noRaceYet?: boolean;
  // Adaptive — beginner
  sportBackground?: string[];
  motivation?: string;
  // Adaptive — intermediate
  bestTime?: string;
  weakestDiscipline?: string[];
  hasHumanCoach?: string;
  // Adaptive — veteran
  targetTime?: string;
  trackedMetrics?: string[];
  // Constraints
  fixedConstraints?: string[];
  weeklySessionDay?: string;
}

/** The closed option sets, exactly the POC's. */
export const ONBOARDING_OPTIONS = {
  language: ['en', 'da'],
  experienceLevel: ['beginner', 'intermediate', 'veteran'],
  raceDistance: RACE_DISTANCES,
  sportBackground: ['Runner', 'Cyclist', 'Swimmer', 'Gym', 'None'],
  motivation: ['Completion', 'Personal challenge', 'Community', 'Performance'],
  weakestDiscipline: ['Swim', 'Bike', 'Run', 'Equal'],
  hasHumanCoach: ['Yes', 'No'],
  trackedMetrics: ['Heart Rate', 'Power', 'HRV', 'Pace', 'None'],
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  // Any weekday, and no "Flexible" (retired 2026-09-14, CONTEXT.md): the
  // proposed week has to arrive on some day, and a Head Coach sees it the day
  // before that. The same seven the Fixed Constraints use.
  weeklySessionDay: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
} as const;

/**
 * The option groups the UI renders as labelled tiles, and the message key each
 * value carries. Language and experience level are not here: they are rendered
 * with their own inline labels at their own steps.
 *
 * This map is exhaustive *by type*. `LabelledOption` is derived from
 * `ONBOARDING_OPTIONS` itself, so adding a value to any group above without
 * giving it a label here fails `tsc` — which is the point. Three of the
 * available-hours buckets shipped to the deployment as raw message keys
 * (`Onboarding.10-13h`) precisely because the old map was a plain
 * `Record<string, string>`, and a plain record cannot notice what is missing.
 *
 * A key present here still has to exist in every locale catalogue; that half is
 * enforced by the colocated test, not by the type.
 */
type LabelledGroup =
  | 'raceDistance'
  | 'sportBackground'
  | 'motivation'
  | 'weakestDiscipline'
  | 'hasHumanCoach'
  | 'trackedMetrics'
  | 'days'
  | 'weeklySessionDay';

/** Every option value the UI renders as a labelled tile. */
export type LabelledOption = (typeof ONBOARDING_OPTIONS)[LabelledGroup][number];

export const OPTION_MESSAGE_KEY: Record<LabelledOption, string> = {
  Sprint: 'optSprint',
  Olympic: 'optOlympic',
  Half: 'optHalf',
  Full: 'optFull',
  Runner: 'optRunner',
  Cyclist: 'optCyclist',
  Swimmer: 'optSwimmer',
  Gym: 'optGym',
  None: 'optNone',
  Completion: 'optCompletion',
  'Personal challenge': 'optChallenge',
  Community: 'optCommunity',
  Performance: 'optPerformance',
  Swim: 'optSwim',
  Bike: 'optBike',
  Run: 'optRun',
  Equal: 'optEqual',
  Yes: 'optYes',
  No: 'optNo',
  'Heart Rate': 'optHR',
  Power: 'optPower',
  HRV: 'optHRV',
  Pace: 'optPace',
  Monday: 'dayMonday',
  Tuesday: 'dayTuesday',
  Wednesday: 'dayWednesday',
  Thursday: 'dayThursday',
  Friday: 'dayFriday',
  Saturday: 'daySaturday',
  Sunday: 'daySunday',
};

/** Which submission-tracked steps have been answered (an empty answer counts). */
export interface OnboardingSubmitted {
  name?: boolean;
  adaptive?: boolean;
  constraints?: boolean;
}

/**
 * The first unanswered step, or 'done'. The name, adaptive and constraints
 * steps count as answered once explicitly submitted — every question on them
 * is optional, so submission is tracked by the caller passing `submitted` (an
 * empty submission is a legitimate answer). The name step is tracked this way
 * for a second reason: its value is never in `answers` at all.
 */
export function nextStep(
  answers: OnboardingAnswers,
  submitted: OnboardingSubmitted = {},
): OnboardingStepId | 'done' {
  if (!answers.language) return 'language';
  if (!submitted.name) return 'name';
  // An empty list is an answer; the derived level is set in the same write.
  if (!answers.pastRaces) return 'pastRaces';
  if (!answers.raceDistance) return 'distance';
  if (answers.hoursPerWeek === undefined) return 'hours';
  // Answered either way: a named race *with its date*, or an explicit "not
  // yet". A bare `!answers.raceTarget` would send the athlete who has no race
  // back to this step forever, which is the defect the `noRaceYet` decision
  // exists to fix. And a name without a date is what the old free-text field
  // left behind — `completeProfile` refuses it, so this must too, or a resumed
  // record sails past every step and is stuck at the end (CodeRabbit, PR #60).
  if (!hasNamedRace(answers) && !answers.noRaceYet) return 'race';
  if (!submitted.adaptive) return 'adaptive';
  if (!submitted.constraints) return 'constraints';
  return 'done';
}

/**
 * The step before `step` in the sequence, or null on the first. Back walks
 * this (showable-version/32); the answers it lands on stay saved.
 */
export function previousStep(step: OnboardingStepId): OnboardingStepId | null {
  const i = ONBOARDING_STEPS.indexOf(step);
  return i > 0 ? ONBOARDING_STEPS[i - 1] : null;
}

/**
 * The step after `step` in the sequence, whatever is answered — the walk
 * forward after Back revisits every later step with its saved answer, so the
 * athlete who changed their level gets that level's adaptive questions again.
 * `nextStep` (first unanswered) is for resuming; this is for walking.
 */
export function stepAfter(step: OnboardingStepId): OnboardingStepId | 'done' {
  const i = ONBOARDING_STEPS.indexOf(step);
  return i + 1 < ONBOARDING_STEPS.length ? ONBOARDING_STEPS[i + 1] : 'done';
}

/**
 * Where the client's cursor goes after the server accepted `current`. The
 * server reports the first *unanswered* step, which after Back is the step the
 * athlete had already reached — so the walk follows the sequence instead, and
 * only `done` (the profile completed) is taken from the server.
 */
export function cursorAfter(
  current: OnboardingStepId,
  serverStep: OnboardingStepId | 'done',
): OnboardingStepId | 'done' {
  return serverStep === 'done' ? 'done' : stepAfter(current);
}

/**
 * A race is named only when it has a date. The one definition, because
 * `nextStep` and `completeProfile` asking two different questions of the same
 * fields is how an athlete gets past every step and then cannot finish.
 */
function hasNamedRace(answers: OnboardingAnswers): boolean {
  return Boolean(answers.raceTarget && answers.raceDate);
}

/** What the client may submit for one step. Everything else is refused. */
export type StepAnswer =
  | { step: 'language'; language: string }
  /** The Preferred Name, or absent/blank for none. Validated here, stored by the action. */
  | { step: 'name'; preferredName?: string }
  /** Zero or more finished races; each entry is checked by `parsePastRace`. */
  | { step: 'pastRaces'; pastRaces: unknown[] }
  | { step: 'distance'; raceDistance: string }
  /** Hours a week, an integer 1–30. */
  | { step: 'hours'; hoursPerWeek: number }
  | { step: 'race'; raceTarget: string; raceDate: string }
  | { step: 'race'; noRaceYet: true }
  | {
      step: 'adaptive';
      sportBackground?: string[];
      motivation?: string;
      bestTime?: string;
      weakestDiscipline?: string[];
      hasHumanCoach?: string;
      targetTime?: string;
      trackedMetrics?: string[];
    }
  | { step: 'constraints'; fixedConstraints?: string[]; weeklySessionDay?: string };

/** The adaptive step's answer fields, minus the discriminator. */
export type AdaptiveField = Exclude<keyof Extract<StepAnswer, { step: 'adaptive' }>, 'step'>;

/**
 * Which adaptive questions each level is asked (hours a week is its own
 * required step since `training-architecture/35`). The panel submits only these: `applyAnswer('adaptive')` stores
 * every field it is sent, so after Back and a level change the other level's
 * seeded answers would otherwise be re-submitted from a panel that never
 * showed them (review, 2026-09-18).
 */
export const ADAPTIVE_FIELDS_BY_LEVEL: Record<ExperienceLevel, readonly AdaptiveField[]> = {
  beginner: ['sportBackground', 'motivation'],
  intermediate: ['bestTime', 'weakestDiscipline', 'hasHumanCoach'],
  veteran: ['targetTime', 'trackedMetrics'],
};

const FREE_TEXT_MAX = 200;

// A server action's payload is untrusted input, not a typed call: the declared
// TypeScript shape is erased at runtime, so a hand-rolled request can send a
// number where a string is declared, or omit a field entirely. Every check below
// verifies the runtime shape before trusting it.
const inSet = (value: unknown, options: readonly string[]) =>
  typeof value === 'string' && options.includes(value);

/** Undefined is allowed (the question is optional); anything present must be a valid array. */
const allInSet = (values: unknown, options: readonly string[]) =>
  values === undefined ||
  (Array.isArray(values) && values.every((v) => inSet(v, options)));

/** Undefined is allowed; anything present must be a string within the cap. */
const optionalText = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null; // present but wrong type — refuse
  return value.trim().slice(0, FREE_TEXT_MAX);
};

/**
 * Applies one submitted answer to the answer record — the single validation
 * gate between a client payload and the stored profile JSONB.
 *
 * Closed-set answers are checked against {@link ONBOARDING_OPTIONS}; free text
 * is trimmed and length-capped. Returns null for anything invalid — the caller
 * refuses, nothing is stored. Pure: state in, state out.
 */
export function applyAnswer(
  answers: OnboardingAnswers,
  submitted: OnboardingSubmitted,
  payload: StepAnswer,
  /** `YYYY-MM-DD`: a past race may not be dated after today. */
  today: string,
): {
  answers: OnboardingAnswers;
  submitted: OnboardingSubmitted;
} | null {
  switch (payload.step) {
    case 'language': {
      if (!inSet(payload.language, ONBOARDING_OPTIONS.language)) return null;
      return { answers: { ...answers, language: payload.language }, submitted };
    }
    case 'name': {
      // Validated with the same rule the write boundary applies, refused the
      // same way — but the value itself goes no further than this check. The
      // answers are profile JSONB on a training table, and a name may not land
      // there (ADR 0006); the action stores it on the user.
      if (!parsePreferredName(payload.preferredName).ok) return null;
      return { answers, submitted: { ...submitted, name: true } };
    }
    case 'pastRaces': {
      // Every entry or none: one bad row refuses the answer rather than
      // storing the rest, so the athlete sees which row the form rejects.
      const pastRaces = parsePastRaces(payload.pastRaces, today);
      if (!pastRaces) return null;
      return {
        answers: { ...answers, pastRaces, experienceLevel: deriveExperienceLevel(pastRaces) },
        submitted,
      };
    }
    case 'hours': {
      if (!isHoursPerWeek(payload.hoursPerWeek)) return null;
      return { answers: { ...answers, hoursPerWeek: payload.hoursPerWeek }, submitted };
    }
    case 'distance': {
      if (!inSet(payload.raceDistance, ONBOARDING_OPTIONS.raceDistance)) return null;
      return {
        answers: { ...answers, raceDistance: payload.raceDistance as RaceDistance },
        submitted,
      };
    }
    case 'race': {
      // `=== true`, not truthy: a forged payload can send any value, and only
      // the literal decision counts as one.
      if ((payload as { noRaceYet?: unknown }).noRaceYet === true) {
        // Stored as a decision, and stored *alone* — an athlete who changes their
        // mind must not leave a stale race sitting behind the flag.
        return {
          answers: { ...answers, raceTarget: undefined, raceDate: undefined, noRaceYet: true },
          submitted,
        };
      }
      const named = payload as { raceTarget?: unknown; raceDate?: unknown };
      // Not `payload.raceTarget.trim()`: the field can be absent or a non-string
      // at runtime, which would throw instead of refusing.
      if (typeof named.raceTarget !== 'string') return null;
      const race = named.raceTarget.trim();
      if (!race || race.length > FREE_TEXT_MAX) return null;
      // A name with no date is exactly what the old free-text field allowed, and
      // what four regexes then guessed at. There is no guessing now, so a race
      // without a date is refused rather than half-stored.
      if (!isCalendarDate(named.raceDate)) return null;
      return {
        answers: { ...answers, raceTarget: race, raceDate: named.raceDate, noRaceYet: undefined },
        submitted,
      };
    }
    case 'adaptive': {
      if (!allInSet(payload.sportBackground, ONBOARDING_OPTIONS.sportBackground))
        return null;
      // `!== undefined`, not a truthy check: undefined means the optional
      // question was left unanswered, but `null`, `''`, `0` and `false` are all
      // *present* values a forged payload can send, and a truthy guard would
      // wave them past `inSet` into the stored profile — exactly what the note
      // above says this file must not do. `allInSet` and `optionalText` already
      // draw the line here; these three were the outliers.
      if (
        payload.motivation !== undefined &&
        !inSet(payload.motivation, ONBOARDING_OPTIONS.motivation)
      )
        return null;
      if (!allInSet(payload.weakestDiscipline, ONBOARDING_OPTIONS.weakestDiscipline))
        return null;
      if (
        payload.hasHumanCoach !== undefined &&
        !inSet(payload.hasHumanCoach, ONBOARDING_OPTIONS.hasHumanCoach)
      )
        return null;
      if (!allInSet(payload.trackedMetrics, ONBOARDING_OPTIONS.trackedMetrics))
        return null;
      const bestTime = optionalText(payload.bestTime);
      const targetTime = optionalText(payload.targetTime);
      if (bestTime === null || targetTime === null) return null;
      return {
        answers: {
          ...answers,
          sportBackground: payload.sportBackground,
          motivation: payload.motivation,
          bestTime: bestTime || undefined,
          weakestDiscipline: payload.weakestDiscipline,
          hasHumanCoach: payload.hasHumanCoach,
          targetTime: targetTime || undefined,
          trackedMetrics: payload.trackedMetrics,
        },
        submitted: { ...submitted, adaptive: true },
      };
    }
    case 'constraints': {
      if (!allInSet(payload.fixedConstraints, ONBOARDING_OPTIONS.days)) return null;
      if (
        payload.weeklySessionDay !== undefined &&
        !inSet(payload.weeklySessionDay, ONBOARDING_OPTIONS.weeklySessionDay)
      )
        return null;
      return {
        answers: {
          ...answers,
          fixedConstraints: payload.fixedConstraints ?? [],
          weeklySessionDay: payload.weeklySessionDay,
        },
        submitted: { ...submitted, constraints: true },
      };
    }
    default:
      return null;
  }
}

/** Every entry parsed, or null when any is refused or the value is not a list. */
function parsePastRaces(value: unknown, today: string): PastRace[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map((entry) => parsePastRace(entry, today));
  return parsed.every((r): r is PastRace => r !== null) ? parsed : null;
}

export const HOURS_PER_WEEK_MIN = 1;
export const HOURS_PER_WEEK_MAX = 30;

/** A whole number of hours inside the band; anything else is refused. */
function isHoursPerWeek(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= HOURS_PER_WEEK_MIN && (value as number) <= HOURS_PER_WEEK_MAX;
}

/** "1 past race" / "N past races" — the count the Coach is told, never the level's old guess. */
function countRaces(pastRaces: readonly PastRace[] | undefined): string {
  const n = pastRaces?.length ?? 0;
  return `${n} past race${n === 1 ? '' : 's'}`;
}

/**
 * The Communication Style directive the Coach reads on every prompt. The POC's
 * text with one deliberate change: never the athlete's name — this string lands
 * in a training-table column and in prompts (GDPR decision 1), so the subject is
 * always "The athlete".
 */
export function buildCommStyle(answers: OnboardingAnswers): string {
  const { experienceLevel, motivation, hasHumanCoach, trackedMetrics } = answers;
  const n = 'The athlete';
  if (experienceLevel === 'beginner') {
    if (motivation === 'Performance')
      return `${n} is a first-timer with a performance mindset. Be direct and explain the reasoning behind training choices.`;
    if (motivation === 'Community')
      return `${n} is motivated by the community experience. Keep coaching warm and encouraging while being clear about expectations.`;
    return `${n} is a first-time Ironman athlete. Keep coaching encouraging and process-focused. Avoid jargon. Celebrate effort and consistency.`;
  }
  if (experienceLevel === 'intermediate') {
    const coached = hasHumanCoach === 'Yes' ? ' and works with a human coach' : '';
    return `${n} has ${countRaces(answers.pastRaces)} finished${coached}. Respect their experience. Be direct and evidence-led. Focus on tactical adjustments rather than fundamentals.`;
  }
  if (experienceLevel === 'veteran') {
    const tracks =
      trackedMetrics && trackedMetrics.length > 0 && !trackedMetrics.includes('None')
        ? ` Tracks ${trackedMetrics.join(', ')}.`
        : '';
    return `${n} is a veteran Ironman athlete.${tracks} Use data-aware language. Be direct and performance-focused. Skip beginner explanations entirely.`;
  }
  return '';
}

/**
 * The onboarding answers in the shape the Coach prompts consume (the
 * ONBOARDING PROFILE block — see prompts.ts `buildOnboardingLines`). Empty
 * answers become null so the block omits them.
 */
export function toCoachOnboarding(answers: OnboardingAnswers): Onboarding {
  const arr = (v: string[] | undefined) => (v && v.length > 0 ? v : null);
  return {
    sportBackground: arr(answers.sportBackground),
    hoursPerWeek: answers.hoursPerWeek ?? null,
    motivation: answers.motivation || null,
    bestTime: answers.bestTime || null,
    weakestDiscipline: arr(answers.weakestDiscipline),
    hasHumanCoach: answers.hasHumanCoach || null,
    targetTime: answers.targetTime || null,
    trackedMetrics: arr(answers.trackedMetrics),
  };
}

/** The four catalogue keys the greeting is built from; a translator over them. */
export type GreetingKey = 'greetingIntroNamed' | 'greetingIntro' | 'greetingBodyRace' | 'greetingBody';
export type GreetingTranslator = (key: GreetingKey, values?: Record<string, string>) => string;

/**
 * The Coach's greeting when onboarding completes — the POC's `coachGreeting`,
 * unchanged in shape. The name is the **Preferred Name** the athlete chose
 * (`preferred-name/02`), or nothing; it is never derived from `user.name` any
 * more. Still DISPLAY ONLY: the action renders this on screen but persists the
 * name-free variant (`coachGreeting('', race, t)`) to the conversation log,
 * because `messages` is a training-side table keyed by athlete id and must
 * never carry a name (ADR 0006). The Coach's prompts resolve the Preferred
 * Name on their own path (`briefing.ts`, `prompt-blocks.ts`), not from here.
 */
export function coachGreeting(
  name: string | null | undefined,
  race: string,
  t: GreetingTranslator,
): { intro: string; body: string } {
  const intro = name ? t('greetingIntroNamed', { name }) : t('greetingIntro');
  const body = race ? t('greetingBodyRace', { race }) : t('greetingBody');
  return { intro, body };
}

/** What completing onboarding writes to the athlete's profile columns. */
export interface CompletedProfile {
  experienceLevel: ExperienceLevel;
  /** Hours a week, the ceiling every week is sized within (35). */
  hoursPerWeek: number;
  /** The finished races the athlete listed, replacing whatever was stored. */
  pastRaces: PastRace[];
  communicationStyle: string;
  raceDistance: RaceDistance;
  /** The Target Race's name, or `''` for an athlete with no race booked. */
  raceTarget: string;
  /** The Target Race, or null when the athlete said they have none yet. */
  race: { name: string; date: string; distance: RaceDistance } | null;
}

/**
 * Assembles the profile columns from a finished answer set. Returns null while
 * required answers are missing — completion is impossible until the flow
 * reached its end.
 *
 * Experience and **Race Distance** are required; the race itself is not. An
 * athlete who answered "no race yet" completes onboarding with `race: null`,
 * which is a finished profile rather than a half-finished one.
 *
 * No clock: the Training Phase used to be computed here and written to a column
 * (`training-architecture/03` retired it), and nothing else this assembles
 * depends on what day it is.
 */
export function completeProfile(answers: OnboardingAnswers): CompletedProfile | null {
  if (!answers.experienceLevel || !answers.raceDistance || answers.hoursPerWeek === undefined) return null;
  const hasRace = hasNamedRace(answers);
  if (!hasRace && !answers.noRaceYet) return null;
  return {
    experienceLevel: answers.experienceLevel,
    hoursPerWeek: answers.hoursPerWeek,
    pastRaces: answers.pastRaces ?? [],
    communicationStyle: buildCommStyle(answers),
    raceDistance: answers.raceDistance,
    raceTarget: answers.raceTarget ?? '',
    race: hasRace
      ? {
          name: answers.raceTarget as string,
          date: answers.raceDate as string,
          distance: answers.raceDistance,
        }
      : null,
  };
}
