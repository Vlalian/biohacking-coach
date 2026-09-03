import type { SessionHistoryItem } from '@/features/coach/check-in';
import type { PlanType } from '@/features/coach/weekly-session';

/**
 * The training history behind the two generated athletes on the Head Coach's
 * Roster (showable-version/03).
 *
 * Pure by construction: profile and clock in, rows out. No database, no
 * `getDb`, nothing imported from `scripts/`. That is not tidiness — the seed
 * script cannot run without credentials and a live Postgres, so anything
 * written directly into it is unverifiable, and "is this data thick enough to
 * judge a Coach Briefing against" would go untested. Here it is a unit test.
 *
 * The randomness is a parameter for the same reason. A generator reaching for
 * `Math.random()` makes "the two athletes differ" pass intermittently and
 * reshapes the Roster on every reseed, which is the opposite of what a seed is
 * for.
 *
 * What the ticket asks the data to support, and what each part below exists for:
 * profiles that are *deliberately different*, because the product's claim is
 * that the Coach adapts; realistic distribution rather than a uniform grid; a
 * skip and an Unavailable date, because a real week is not clean and **US-3**
 * says a skip is never an alarm; and enough signal that **Pattern Insight** has
 * something true to find.
 */

/** One generated session, in the shape the seed inserts. */
export interface SyntheticSession {
  date: string;
  type: PlanType;
  origin: 'coach';
  status: 'completed' | 'skipped';
  duration: number;
  zone: string | null;
  title: string;
  note: string | null;
  feedbackBody: number | null;
  feedbackMind: number | null;
  feedbackComment: string | null;
}

export interface SyntheticHistory {
  sessions: SyntheticSession[];
  unavailableDates: string[];
}

/** The athlete this history belongs to — the profile columns plus its shape. */
export interface SyntheticProfile {
  id: string;
  syntheticLabel: string;
  experienceLevel: 'beginner' | 'intermediate' | 'veteran';
  trainingPhase: string;
  raceTarget: string;
  communicationStyle: string;
  /** Sessions per week, before skips. The first-timer trains fewer days. */
  sessionsPerWeek: number;
  /** Minutes per session by type, before the weekly variation is applied. */
  durations: Record<PlanType, number>;
  /**
   * The weekly template, drawn from in order. Its mix is the athlete's shape.
   *
   * {@link PlanType} rather than plain strings, and that is a constraint rather
   * than tidiness: every row this module emits carries `origin: 'coach'`, and
   * the Coach may only propose these four. Strength is an *Athlete* Session type
   * (`athlete-session-rules.ts`), so a coach-origin Strength row is one the
   * app's own rules would refuse — Alex's template carried one until 2026-09-03.
   */
  week: readonly PlanType[];
}

const ZONES: Record<PlanType, string | null> = {
  Endurance: 'Zone 2',
  Tempo: 'Zone 3',
  Intensity: 'Zone 4',
  Recovery: 'Zone 1',
};

/**
 * Two athletes who are meant to read as two people.
 *
 * A first-timer twelve weeks out and a veteran deep in Build put different words
 * in the Coach's mouth, and that contrast *is* the demonstration — so the
 * difference is deliberate in every field a prompt reads: experience, phase,
 * race, Communication Style, volume, and the proportion of hard work in a week.
 *
 * Both keep `userId` null and carry a fabricated `syntheticLabel`. That is the
 * one place a name may sit in a training table (ADR 0006) and it names nobody
 * real. The database enforces the rest: `athlete_identity_source` checks that
 * exactly one of `user_id` and `synthetic_label` is set, so neither of these can
 * acquire a login by accident.
 */
export const SYNTHETIC_PROFILES: readonly SyntheticProfile[] = [
  {
    id: 'b1e7c0d2-3f4a-4b5c-8d6e-7f8a9b0c1d2e',
    syntheticLabel: 'Alex Rivera',
    experienceLevel: 'beginner',
    trainingPhase: 'Base Building',
    raceTarget: 'First Ironman 70.3, June 2027',
    communicationStyle:
      'The athlete is a first-time Ironman athlete. Keep coaching encouraging and process-focused. Avoid jargon. Celebrate effort and consistency.',
    sessionsPerWeek: 4,
    durations: { Endurance: 55, Recovery: 35, Tempo: 45, Intensity: 35 },
    week: ['Endurance', 'Recovery', 'Tempo', 'Endurance', 'Endurance', 'Intensity'],
  },
  {
    id: 'c2f8d1e3-4a5b-4c6d-9e7f-8a9b0c1d2e3f',
    syntheticLabel: 'Sam Chen',
    experienceLevel: 'veteran',
    trainingPhase: 'Build Phase',
    raceTarget: 'Ironman Copenhagen, August 2027 — sub 10:30',
    communicationStyle:
      'The athlete is a veteran Ironman athlete. Tracks Heart Rate, Power. Use data-aware language. Be direct and performance-focused. Skip beginner explanations entirely.',
    sessionsPerWeek: 6,
    durations: { Endurance: 110, Recovery: 45, Tempo: 70, Intensity: 60 },
    week: ['Intensity', 'Endurance', 'Tempo', 'Intensity', 'Endurance', 'Recovery'],
  },
] as const;

/**
 * A deterministic pseudo-random source — a 32-bit xorshift, seeded by the
 * caller.
 *
 * Local and tiny on purpose: the requirement is reproducibility, not
 * statistical quality, and a dependency for eleven lines of arithmetic would be
 * a worse trade than the arithmetic.
 */
function rng(seed: number) {
  let state = seed | 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    // >>> 0 first: the shifts above produce a signed 32-bit value, and a
    // negative one would map to a negative "probability" that every threshold
    // comparison below silently passes.
    return (state >>> 0) / 0x1_0000_0000;
  };
}

const dayKey = (from: Date, daysBack: number): string => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - daysBack);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const COMMENTS = [
  'Felt strong the whole way.',
  'Legs never really woke up.',
  'Better than last week, still cautious on the descents.',
  'Held the numbers but it cost me.',
  'Easy day done easy for once.',
];

/** A Session Reflection, or none — the athlete did not rate every session. */
interface Reflection {
  body: number;
  mind: number;
  comment: string | null;
}

/**
 * What the athlete reported after one session.
 *
 * `afterIntensity` forces a rating rather than leaving it to the 78%: elsewhere
 * that gap is what keeps the data human, but here it would silently drop planted
 * dips and leave the correlation under the three occurrences the detector needs.
 */
function reflectionFor(afterIntensity: boolean, random: () => number): Reflection | null {
  // Stryker disable next-line EqualityOperator — `>=` vs `>` on a continuous
  // draw; identical unless a draw is exactly 0.78.
  if (!afterIntensity && random() >= 0.78) return null;
  return {
    // 2 or 3 after intensity work — both sit at or under the detector's "low"
    // threshold, which is what makes the planted correlation real.
    body: afterIntensity ? 2 + Math.floor(random() * 2) : 3 + Math.floor(random() * 3),
    mind: 3 + Math.floor(random() * 3),
    // Stryker disable next-line EqualityOperator — `<` vs `<=` on a continuous
    // draw; identical unless a draw is exactly 0.3.
    comment: random() < 0.3 ? COMMENTS[Math.floor(random() * COMMENTS.length)] : null,
  };
}

/**
 * One session row.
 *
 * `skipped` is passed, never derived from `reflection` being null: a completed
 * session the athlete simply did not rate also has no reflection, and conflating
 * the two turns roughly a fifth of every history into skips.
 */
function buildSession(
  profile: SyntheticProfile,
  type: PlanType,
  date: string,
  skipped: boolean,
  reflection: Reflection | null,
  random: () => number,
): SyntheticSession {
  const rating = reflection ?? { body: null, mind: null, comment: null };
  return {
    date,
    type,
    origin: 'coach',
    status: skipped ? 'skipped' : 'completed',
    // ±10% so two athletes on the same template still look hand-made.
    duration: Math.round(profile.durations[type] * (0.9 + random() * 0.2)),
    zone: ZONES[type],
    title: `${type} session`,
    note: null,
    feedbackBody: rating.body,
    feedbackMind: rating.mind,
    feedbackComment: rating.comment,
  };
}

/**
 * How many sessions this week holds.
 *
 * Volume breathes week to week — a real block is not the same seven days
 * repeated, and a uniform grid is the tell of generated data.
 */
const weeklyCount = (profile: SyntheticProfile, random: () => number): number =>
  // Stryker disable next-line EqualityOperator — `<` vs `<=` on a continuous
  // draw: the generator is identical unless a draw is exactly 0.35, which a
  // 32-bit source reaches with probability ~2^-32. Not a testable difference.
  profile.sessionsPerWeek - (random() < 0.35 ? 1 : 0);

/**
 * The day this week is blocked, or none.
 *
 * Every third week — life, not a gap in the data. Never a day a session took:
 * the calendar would have to render a day that is both blocked and trained.
 *
 * An Unavailable Date must not share a day with a session — the calendar would
 * have to render a day that is both blocked and trained.
 */
function blockedDayFor(today: Date, week: number, taken: Set<string>): string | null {
  if (week % 3 !== 1) return null;
  // Stryker disable next-line EqualityOperator — `<` vs `<=` on the bound: a
  // week holds at most six sessions, so offset 0-6 always finds a free day and
  // the seventh iteration is unreachable.
  for (let offset = 0; offset < 7; offset++) {
    const candidate = dayKey(today, week * 7 + offset + 1);
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Builds one athlete's past.
 *
 * `weeks` counts backwards from `today`, most recent first, and every session
 * is dated strictly in the past — a seeded athlete arriving with a pre-planned
 * future week would contradict how a Week Plan is produced (by running a Weekly
 * Session and confirming it, not by the seed).
 *
 * The **post-intensity dip** is planted rather than hoped for. Of the four
 * patterns `detectPatterns` looks for, three need sleep or resting pulse and a
 * session row carries neither — so the reachable one is low body feedback in
 * the session immediately after an intensity session, and it needs three
 * occurrences before it counts as a pattern at all. Leaving that to chance
 * would make the ticket's "Pattern Insight has something true to find" a
 * coin-flip, so the generator guarantees it: the session after an intensity
 * session is rated low. It is a true correlation in the data, not a claim
 * asserted about it.
 */
export function generateSyntheticHistory(
  profile: SyntheticProfile,
  weeks: number,
  today: Date,
  seed: number,
): SyntheticHistory {
  const random = rng(seed);
  const sessions: SyntheticSession[] = [];
  const unavailableDates: string[] = [];
  const taken = new Set<string>();

  let afterIntensity = false;

  // Oldest week first, and within a week the oldest day first, so the sequence
  // is built in the order it happened. That matters beyond tidiness: the
  // post-intensity dip is a relationship between *consecutive* sessions, and
  // `detectPatterns` reads them in date order. Generating newest-first and
  // sorting afterwards silently plants the dip on the wrong session.
  for (let week = weeks - 1; week >= 0; week--) {
    const count = weeklyCount(profile, random);

    for (let i = count - 1; i >= 0; i--) {
      // Indexed by how far into the week this session is, not by the countdown
      // `i`. They run opposite ways — `i` descends so the *dates* ascend — so
      // reading the template by `i` walked it backwards, and the comment on
      // `SyntheticProfile.week` promising it is "drawn from in order" was false
      // of every week generated.
      const dayOfWeek = count - 1 - i;
      const type = profile.week[(week + dayOfWeek) % profile.week.length];
      // One session per day, spread across the week. `i` is under 7, so days
      // within a week are distinct and never reach into the next one.
      const date = dayKey(today, week * 7 + i + 1);
      taken.add(date);

      // A real week is not clean, and US-3 says a skip is never an alarm.
      // Stryker disable next-line EqualityOperator — `<` vs `<=` on a
      // continuous draw; identical unless a draw is exactly 0.08.
      const skipped = random() < 0.08;
      const reflection = skipped ? null : reflectionFor(afterIntensity, random);
      sessions.push(buildSession(profile, type, date, skipped, reflection, random));

      // A skip leaves this untouched on purpose: a skipped session is filtered
      // out of the history the detector reads, so from its point of view the
      // next *completed* session is still the one following the intensity work.
      if (!skipped) afterIntensity = type === 'Intensity';
    }

    const blocked = blockedDayFor(today, week, taken);
    if (blocked !== null) unavailableDates.push(blocked);
  }

  // No sort: the loops above run oldest-first, so `sessions` is already in date
  // order. Sorting here would be dead code that looks load-bearing.
  return { sessions, unavailableDates };
}

/**
 * The athlete row the seed inserts.
 *
 * `userId` is absent rather than null-and-present, and that is the whole point:
 * `athlete_identity_source` checks `(user_id IS NULL) <> (synthetic_label IS
 * NULL)`, so a synthetic athlete carrying a user id is rejected by Postgres, not
 * merely frowned upon. Neither of these can sign in, and the database is what
 * guarantees it.
 */
export function toAthleteRow(profile: SyntheticProfile) {
  return {
    id: profile.id,
    syntheticLabel: profile.syntheticLabel,
    experienceLevel: profile.experienceLevel,
    trainingPhase: profile.trainingPhase,
    communicationStyle: profile.communicationStyle,
    raceTarget: profile.raceTarget,
  };
}

/**
 * The generated history as session rows, scoped to their own athlete.
 *
 * `origin: 'coach'` throughout, which is what makes the seed re-runnable: the
 * existing reseed pattern deletes an athlete's coach-origin rows and re-inserts
 * in one batch, so anything the athlete or an import produced survives a reseed
 * untouched.
 *
 * `ratedAt` is derived rather than passed. It is the column that marks a Session
 * Reflection as given, so scores without a timestamp would render as a session
 * nobody rated — the two must agree, and deriving it is how they cannot drift.
 */
export function toSessionRows(
  profile: SyntheticProfile,
  sessions: readonly SyntheticSession[],
  ratedAt: Date = new Date(),
) {
  return sessions.map((s) => ({
    athleteId: profile.id,
    date: s.date,
    origin: s.origin,
    status: s.status,
    dayOrder: 0,
    isTraining: true,
    type: s.type,
    duration: s.duration,
    zone: s.zone,
    title: s.title,
    note: s.note,
    feedbackBody: s.feedbackBody,
    feedbackMind: s.feedbackMind,
    feedbackComment: s.feedbackComment,
    ratedAt: s.feedbackBody === null ? null : ratedAt,
  }));
}

/**
 * The generated sessions in the shape Pattern Insight consumes.
 *
 * `sleep`, `pulse` and `pushedBack` are left undefined because a session row
 * carries none of them — mapping a plausible number in here would be inventing
 * data the app does not have, which is the failure `NO_CHECK_IN` exists to stop.
 * Ordered by date, because the post-intensity rule reads consecutive entries.
 */
export function toSessionHistory(
  sessions: readonly SyntheticSession[],
): SessionHistoryItem[] {
  return sessions
    .filter((s) => s.status === 'completed')
    .map((s) => ({
      sessionType: s.type.toLowerCase(),
      ...(s.feedbackBody !== null ? { bodyFeedback: s.feedbackBody } : {}),
      ...(s.feedbackMind !== null ? { mindFeedback: s.feedbackMind } : {}),
    }));
}
