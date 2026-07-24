import type { Onboarding } from '@/features/coach/check-in';

/**
 * The MCQ onboarding flow as pure data and functions — ported from the POC's
 * `onboarding.js` (the specification per ticket 09), minus its DOM rendering.
 *
 * Three deliberate deviations from the POC, each pinned by a standing decision:
 *
 * - **No name step.** The athlete's name already lives on the better-auth user
 *   (slice 02 created it at signup), and no training table may carry it
 *   (ADR 0006) — so onboarding neither asks for nor stores one.
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
  | 'experience'
  | 'race'
  | 'adaptive'
  | 'constraints';

export const ONBOARDING_STEPS: OnboardingStepId[] = [
  'language',
  'experience',
  'race',
  'adaptive',
  'constraints',
];

export type ExperienceLevel = 'beginner' | 'intermediate' | 'veteran';

/**
 * Everything the questionnaire collects. Partial while in progress — the answer
 * record doubles as the resume point: the first unanswered step is where an
 * interrupted onboarding picks back up.
 */
export interface OnboardingAnswers {
  /** UI locale code — 'en' or 'da'. Chosen first, applied immediately. */
  language?: string;
  experienceLevel?: ExperienceLevel;
  raceTarget?: string;
  // Adaptive — beginner
  sportBackground?: string[];
  weeklyHours?: string;
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
  sportBackground: ['Runner', 'Cyclist', 'Swimmer', 'Gym', 'None'],
  weeklyHours: ['Under 3h', '3–6h', '6–10h', '10h+'],
  motivation: ['Completion', 'Personal challenge', 'Community', 'Performance'],
  weakestDiscipline: ['Swim', 'Bike', 'Run', 'Equal'],
  hasHumanCoach: ['Yes', 'No'],
  trackedMetrics: ['Heart Rate', 'Power', 'HRV', 'Pace', 'None'],
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  weeklySessionDay: ['Monday', 'Wednesday', 'Friday', 'Flexible'],
} as const;

/**
 * The first unanswered step, or 'done'. The adaptive step counts as answered
 * once any of its level's answers exist OR it was explicitly submitted — all its
 * questions are optional in the POC, so submission is tracked by the caller
 * passing `adaptiveSubmitted`/`constraintsSubmitted` (an empty submission is a
 * legitimate answer).
 */
export function nextStep(
  answers: OnboardingAnswers,
  submitted: { adaptive?: boolean; constraints?: boolean } = {},
): OnboardingStepId | 'done' {
  if (!answers.language) return 'language';
  if (!answers.experienceLevel) return 'experience';
  if (!answers.raceTarget) return 'race';
  if (!submitted.adaptive) return 'adaptive';
  if (!submitted.constraints) return 'constraints';
  return 'done';
}

/** What the client may submit for one step. Everything else is refused. */
export type StepAnswer =
  | { step: 'language'; language: string }
  | { step: 'experience'; experienceLevel: string }
  | { step: 'race'; raceTarget: string }
  | {
      step: 'adaptive';
      sportBackground?: string[];
      weeklyHours?: string;
      motivation?: string;
      bestTime?: string;
      weakestDiscipline?: string[];
      hasHumanCoach?: string;
      targetTime?: string;
      trackedMetrics?: string[];
    }
  | { step: 'constraints'; fixedConstraints?: string[]; weeklySessionDay?: string };

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
  submitted: { adaptive?: boolean; constraints?: boolean },
  payload: StepAnswer,
): {
  answers: OnboardingAnswers;
  submitted: { adaptive?: boolean; constraints?: boolean };
} | null {
  switch (payload.step) {
    case 'language': {
      if (!inSet(payload.language, ONBOARDING_OPTIONS.language)) return null;
      return { answers: { ...answers, language: payload.language }, submitted };
    }
    case 'experience': {
      if (!inSet(payload.experienceLevel, ONBOARDING_OPTIONS.experienceLevel))
        return null;
      return {
        answers: {
          ...answers,
          experienceLevel: payload.experienceLevel as ExperienceLevel,
        },
        submitted,
      };
    }
    case 'race': {
      // Not `payload.raceTarget.trim()`: the field can be absent or a non-string
      // at runtime, which would throw instead of refusing.
      if (typeof payload.raceTarget !== 'string') return null;
      const race = payload.raceTarget.trim();
      if (!race || race.length > FREE_TEXT_MAX) return null;
      return { answers: { ...answers, raceTarget: race }, submitted };
    }
    case 'adaptive': {
      if (!allInSet(payload.sportBackground, ONBOARDING_OPTIONS.sportBackground))
        return null;
      if (payload.weeklyHours && !inSet(payload.weeklyHours, ONBOARDING_OPTIONS.weeklyHours))
        return null;
      if (payload.motivation && !inSet(payload.motivation, ONBOARDING_OPTIONS.motivation))
        return null;
      if (!allInSet(payload.weakestDiscipline, ONBOARDING_OPTIONS.weakestDiscipline))
        return null;
      if (
        payload.hasHumanCoach &&
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
          weeklyHours: payload.weeklyHours,
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
        payload.weeklySessionDay &&
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

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Derives the Training Phase from the free-text race target — the POC's
 * heuristic, unchanged, but with the clock passed in (`today`) so the same
 * answer computes the same phase in tests and on any machine.
 */
export function computePhase(raceTarget: string | undefined, today: Date): string {
  if (!raceTarget) return 'Base Building';
  const text = raceTarget.toLowerCase();
  let raceDate: Date | null = null;

  // ISO date: 2026-06-01
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    const d = new Date(iso[1]);
    if (!isNaN(d.getTime())) raceDate = d;
  }

  // "Month YYYY" or "Month, YYYY" — e.g. "June 2026", "jun 2026"
  if (!raceDate) {
    const my = text.match(/([a-z]+)[,\s]+(\d{4})/);
    if (my && MONTH_MAP[my[1]] !== undefined) {
      raceDate = new Date(parseInt(my[2]), MONTH_MAP[my[1]], 15);
    }
  }

  // Slash date: 01/06/2026 (day/month/year)
  if (!raceDate) {
    const sl = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (sl) {
      const d = new Date(`${sl[3]}-${sl[2].padStart(2, '0')}-${sl[1].padStart(2, '0')}`);
      if (!isNaN(d.getTime())) raceDate = d;
    }
  }

  // Year only — assume mid-year
  if (!raceDate) {
    const yr = text.match(/\b(20\d{2})\b/);
    if (yr) raceDate = new Date(parseInt(yr[1]), 5, 15);
  }

  if (!raceDate || isNaN(raceDate.getTime())) return 'Base Building';
  const months =
    (raceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.5);
  if (months < 0) return 'Recovery';
  if (months < 2) return 'Taper';
  if (months < 4) return 'Peak Phase';
  if (months < 6) return 'Build Phase';
  return 'Base Building';
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
    return `${n} has 2–4 Ironman finishes${coached}. Respect their experience. Be direct and evidence-led. Focus on tactical adjustments rather than fundamentals.`;
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
    weeklyHours: answers.weeklyHours || null,
    motivation: answers.motivation || null,
    bestTime: answers.bestTime || null,
    weakestDiscipline: arr(answers.weakestDiscipline),
    hasHumanCoach: answers.hasHumanCoach || null,
    targetTime: answers.targetTime || null,
    trackedMetrics: arr(answers.trackedMetrics),
  };
}

/**
 * The Coach's greeting when onboarding completes — the POC's `coachGreeting`,
 * unchanged. The name comes from the better-auth user for DISPLAY ONLY: the
 * action renders this on screen but persists the name-free variant
 * (`coachGreeting('', race)`) to the conversation log, because `messages` is a
 * training-side table keyed by athlete id and must never carry a name
 * (ADR 0006) — and it is never rendered into a model prompt.
 */
export function coachGreeting(
  name: string,
  race: string,
): { intro: string; body: string } {
  const intro = name ? `Hello ${name}. I'm your Coach.` : `I'm your Coach.`;
  const body = race ? `${race} is your target. Let's get to work.` : `Let's get to work.`;
  return { intro, body };
}

/** What completing onboarding writes to the athlete's profile columns. */
export interface CompletedProfile {
  trainingPhase: string;
  experienceLevel: ExperienceLevel;
  communicationStyle: string;
  raceTarget: string;
}

/**
 * Assembles the profile columns from a finished answer set. Returns null while
 * required answers (experience, race) are missing — completion is impossible
 * until the flow reached its end.
 */
export function completeProfile(
  answers: OnboardingAnswers,
  today: Date,
): CompletedProfile | null {
  if (!answers.experienceLevel || !answers.raceTarget) return null;
  return {
    trainingPhase: computePhase(answers.raceTarget, today),
    experienceLevel: answers.experienceLevel,
    communicationStyle: buildCommStyle(answers),
    raceTarget: answers.raceTarget,
  };
}
