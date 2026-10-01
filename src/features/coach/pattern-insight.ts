import { addDays, weekStartOf } from '@/lib/date';
import type { Session } from '@/features/session/session';
import { canSeeAthleteReports, type LinkVisibility } from './link-visibility';
import { WEEKDAYS } from './weekly-offer';

/**
 * Pattern Insight (`training-architecture/50`, ruled with Mads 2026-09-26 and
 * 2026-09-29): code finds candidate patterns in one athlete's own history, and
 * Momentum only decides whether to say one. Momentum may name only what this
 * module finds; with nothing handed over, it names nothing.
 *
 * Each athlete is compared with their own normal, never with others: a robust
 * baseline of median and median absolute deviation (MAD) over their recent
 * values. Pure and framework-free: history in, patterns out, each with the
 * numbers behind it, so the prompt can quote them and the logs can tune the
 * threshold after testing (ruling 7).
 */

export type PatternFamily =
  /** Body or Mind moving away from the athlete's own normal, week over week. */
  | 'shift'
  /** Ratings clearly different for one Session Type, sport or weekday. */
  | 'kind'
  /** Skips or moves clustering on one weekday. Statuses only: the day is wrong, not the body. */
  | 'schedule'
  /** A skip following a low-rated session. */
  | 'body-push-back'
  /** Same sport, similar duration: average heart rate or pace drifting over weeks. */
  | 'effort-drift'
  /** Low Body the session after an Intensity session. */
  | 'low-body-after-intensity'
  /** Dormant until the app records sleep, resting pulse and push-back (`training-architecture/51`). */
  | 'sleep-intensity'
  | 'pulse-push-back'
  | 'sleep-mind';

/** One session as Pattern Insight reads it. */
export interface PatternSession {
  date: string;
  type: string;
  sport: string | null;
  status: string;
  duration: number | null;
  /** Session Reflection, 1–5 smileys: 1 is the worst, 5 the best. */
  body: number | null;
  mind: number | null;
  avgHr: number | null;
  distanceM: number | null;
  /** Dormant inputs: nothing records them yet (`training-architecture/51`). */
  sleepHours?: number;
  restingPulse?: number;
  pushedBack?: boolean;
}

/** A Session Move, as `getSessionMovesSince` reads it back. */
export interface PatternMove {
  from: string;
  to: string;
  by: string;
}

export interface Pattern {
  family: PatternFamily;
  /** What it is about: a Session Type, a sport, a weekday, or `body`/`mind` for a shift. */
  subject: string;
  /** Which measure it is about, where the subject does not say: Body, Mind, heart rate or pace. */
  metric?: 'body' | 'mind' | 'heart rate' | 'pace';
  direction: 'up' | 'down' | null;
  /** The numbers behind it, for Momentum to quote. */
  numbers: Record<string, number>;
  /** How many sessions it rests on. */
  sample: number;
  /**
   * How strong it is: robust deviations from the athlete's own median for the
   * rating and effort families, the number of times it held for the counting
   * ones. Tuned after testing from the logs (ruling 7).
   */
  strength: number;
  /** The Link Visibility section it is built from (Mads, 2026-10-01: Garmin data counts as reports). */
  section: 'reports' | 'always';
}

/** Mads's starting values (ruling 7): tuned from the testers' data, not here. */
export const PATTERN_THRESHOLDS = {
  minWeeks: 3,
  minRatedSessions: 6,
  robustDeviations: 2,
  minHeldOccurrences: 3,
  /** A Session Reflection at or below this is low. */
  lowRating: 2,
  /** Sessions within this share of the usual duration count as similar. */
  similarDuration: 0.2,
} as const;

const T = PATTERN_THRESHOLDS;

const isRated = (x: PatternSession): boolean => x.body !== null || x.mind !== null;

/** Ruling 6: at least three weeks and six rated sessions before any pattern may be named. */
function hasEnoughHistory(sessions: readonly PatternSession[]): boolean {
  const rated = sessions.filter(isRated);
  const weeks = new Set(rated.map((x) => weekStartOf(x.date)));
  return rated.length >= T.minRatedSessions && weeks.size >= T.minWeeks;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How far `value` sits from the athlete's own `baseline`, in robust deviations:
 * the gap over 1.4826 × MAD, the factor that makes MAD read like a standard
 * deviation. A perfectly steady baseline has a MAD of zero; `floor` stands in
 * for it, so a one-step change on a 1–5 scale is not read as infinitely far.
 */
function robustDeviations(value: number, baseline: readonly number[], floor: number): number {
  const centre = median(baseline);
  const mad = median(baseline.map((v) => Math.abs(v - centre)));
  return Math.abs(value - centre) / (1.4826 * Math.max(mad, floor));
}

/** Half a step: the smallest spread an integer 1–5 rating can honestly claim. */
const RATING_FLOOR = 0.5;

// Stryker disable next-line EqualityOperator — equivalent: equal values have strength 0 and never become a pattern, so `>` and `>=` never disagree on one that does
const direction = (from: number, to: number): 'up' | 'down' => (to > from ? 'up' : 'down');

/**
 * Whether a gap is strong enough to name. The boundary is open, and its exact
 * value is unreachable: a robust deviation of exactly 2 needs a gap of
 * 2 × 1.4826 × MAD, which neither half-step ratings nor recorded heart rates
 * and paces produce.
 */
// Stryker disable next-line EqualityOperator — equivalent: see the comment above; strength is never exactly the threshold
const strongEnough = (strength: number): boolean => strength >= T.robustDeviations;

/** Shift: the recent week's ratings against the athlete's own earlier ones. */
function shiftOf(sessions: readonly PatternSession[], metric: 'body' | 'mind', today: string): Pattern[] {
  const since = addDays(weekStartOf(today), -7);
  const rated = sessions.filter((x) => x[metric] !== null);
  const baseline = rated.filter((x) => x.date < since).map((x) => x[metric] as number);
  const recent = rated.filter((x) => x.date >= since).map((x) => x[metric] as number);
  // An empty baseline has no median, so its strength is not a number and never strong enough.
  if (recent.length < 2) return [];
  const [was, now] = [median(baseline), median(recent)];
  const strength = robustDeviations(now, baseline, RATING_FLOOR);
  if (!strongEnough(strength)) return [];
  return [
    {
      family: 'shift',
      subject: metric,
      metric,
      direction: direction(was, now),
      numbers: { baseline: was, recent: now },
      sample: rated.length,
      strength,
      section: 'reports',
    },
  ];
}

/** The weekday a date key falls on, read in UTC like every date key in the app. */
function weekdayOf(key: string): string {
  return WEEKDAYS[new Date(`${key}T00:00:00Z`).getUTCDay()];
}

/** The three ways a session can be a "kind" (ruling 5b). */
const KIND_DIMENSIONS: readonly ((x: PatternSession) => string | null)[] = [
  (x) => x.type,
  (x) => x.sport,
  (x) => weekdayOf(x.date),
];

/** One kind's ratings against every other rated session's, or nothing when either side is thin. */
function kindGap(subject: string, own: number[], others: number[], metric: 'body' | 'mind'): Pattern[] {
  if (own.length < T.minHeldOccurrences || others.length < T.minHeldOccurrences) return [];
  const [mine, rest] = [median(own), median(others)];
  const strength = robustDeviations(mine, others, RATING_FLOOR);
  if (!strongEnough(strength)) return [];
  return [
    {
      family: 'kind',
      subject,
      metric,
      direction: direction(rest, mine),
      numbers: { median: mine, others: rest, sessions: own.length },
      sample: own.length + others.length,
      strength,
      section: 'reports',
    },
  ];
}

/** Kind: for each Session Type, sport and weekday, its ratings against the rest. */
function kindOf(sessions: readonly PatternSession[], metric: 'body' | 'mind'): Pattern[] {
  const rated = sessions.filter((x) => x[metric] !== null);
  return KIND_DIMENSIONS.flatMap((keyOf) => {
    const keys = new Set(rated.map(keyOf).filter((k): k is string => k !== null));
    return [...keys].flatMap((key) => {
      const own = rated.filter((x) => keyOf(x) === key).map((x) => x[metric] as number);
      const others = rated.filter((x) => keyOf(x) !== key).map((x) => x[metric] as number);
      return kindGap(key, own, others, metric);
    });
  });
}

/** A schedule pattern: always visible (statuses and moves are, like the move log), and never push-back. */
function schedulePattern(weekday: string, numbers: Record<string, number>, held: number, sample: number): Pattern {
  return { family: 'schedule', subject: weekday, direction: null, numbers, sample, strength: held, section: 'always' };
}

const isDone = (x: PatternSession): boolean => x.status === 'completed' || x.status === 'skipped';

/** Schedule, skips: a weekday whose sessions are mostly skipped, at least three times (statuses only). */
function skipsOf(sessions: readonly PatternSession[]): Pattern[] {
  const done = sessions.filter(isDone);
  return [...new Set(done.map((x) => weekdayOf(x.date)))].flatMap((day) => {
    const onDay = done.filter((x) => weekdayOf(x.date) === day);
    const skipped = onDay.filter((x) => x.status === 'skipped').length;
    if (skipped < T.minHeldOccurrences || skipped * 2 <= onDay.length) return [];
    return [schedulePattern(day, { skipped, of: onDay.length }, skipped, onDay.length)];
  });
}

/** Schedule, moves: a weekday the athlete keeps moving sessions away from. A coach's move is not theirs. */
function movesOf(moves: readonly PatternMove[]): Pattern[] {
  const own = moves.filter((m) => m.by === 'athlete');
  return [...new Set(own.map((m) => weekdayOf(m.from)))].flatMap((day) => {
    const moved = own.filter((m) => weekdayOf(m.from) === day).length;
    return moved < T.minHeldOccurrences ? [] : [schedulePattern(day, { moved }, moved, moved)];
  });
}

/** The two effort measures a device summary gives, per session. Pace is metres per minute. */
const EFFORT: readonly { metric: 'heart rate' | 'pace'; of: (x: PatternSession) => number | null }[] = [
  { metric: 'heart rate', of: (x) => x.avgHr },
  // Only sessions with a duration reach here (`similarSessions`), so the distance is the only thing that can be missing.
  { metric: 'pace', of: (x) => (x.distanceM === null ? null : x.distanceM / (x.duration as number)) },
];

/** The sessions of one sport close to its usual duration: a 30-minute jog is not compared with a long run. */
function similarSessions(ofSport: readonly PatternSession[]): PatternSession[] {
  const timed = ofSport.filter((x) => x.duration !== null);
  const usual = median(timed.map((x) => x.duration as number));
  return timed.filter((x) => Math.abs((x.duration as number) - usual) <= usual * T.similarDuration);
}

/** One measure over similar sessions: the last two weeks against the weeks before. */
function driftOf(sport: string, similar: readonly PatternSession[], effort: (typeof EFFORT)[number], since: string): Pattern[] {
  const measured = similar.filter((x) => effort.of(x) !== null);
  const baseline = measured.filter((x) => x.date < since).map((x) => effort.of(x) as number);
  const recent = measured.filter((x) => x.date >= since).map((x) => effort.of(x) as number);
  if (recent.length < 2 || baseline.length < T.minHeldOccurrences) return [];
  const [was, now] = [median(baseline), median(recent)];
  // A spread of 1% of the athlete's own level: a steady heart rate is not a still one.
  const strength = robustDeviations(now, baseline, Math.abs(was) * 0.01);
  if (!strongEnough(strength)) return [];
  return [
    {
      family: 'effort-drift',
      subject: sport,
      metric: effort.metric,
      direction: direction(was, now),
      numbers: { baseline: was, recent: now },
      sample: measured.length,
      strength,
      section: 'reports',
    },
  ];
}

/** Effort drift (ruling 5d): for similar sessions of one sport, heart rate or pace moving over weeks. */
function effortDriftOf(sessions: readonly PatternSession[], today: string): Pattern[] {
  const since = addDays(weekStartOf(today), -14);
  const done = sessions.filter((x) => x.status === 'completed');
  const sports = new Set(done.map((x) => x.sport).filter((sport): sport is string => sport !== null));
  return [...sports].flatMap((sport) => {
    const similar = similarSessions(done.filter((x) => x.sport === sport));
    return EFFORT.flatMap((effort) => driftOf(sport, similar, effort, since));
  });
}

/** A pattern that is a count of times something held: three or more, or nothing. */
function heldPattern(family: PatternFamily, subject: string, numbers: Record<string, number>, held: number): Pattern[] {
  if (held < T.minHeldOccurrences) return [];
  return [{ family, subject, direction: null, numbers, sample: held, strength: held, section: 'reports' }];
}

const byDate = (sessions: readonly PatternSession[]): PatternSession[] =>
  [...sessions].sort((a, b) => a.date.localeCompare(b.date));

/** Each session with the one before it, in date order. */
function pairs(sessions: readonly PatternSession[]): [PatternSession, PatternSession][] {
  const sorted = byDate(sessions);
  return sorted.slice(1).map((x, i) => [sorted[i], x]);
}

/**
 * Low Body: at or below the low rating, or well below the athlete's own normal.
 * The second half is what makes this robust: a 3 is low for an athlete who is
 * usually a 5.
 */
function isLowBody(body: number, baseline: readonly number[]): boolean {
  if (body <= T.lowRating) return true;
  // Stryker disable next-line EqualityOperator — equivalent: a Body at the median has strength 0, so it is never low either way
  return body < median(baseline) && strongEnough(robustDeviations(body, baseline, RATING_FLOOR));
}

/**
 * Body push-back (2026-09-29): a skip following a low-rated session. A skipped
 * session carries no rating of its own (`rate-session.ts`), so the pairing is
 * with the rating before it.
 */
function pushBackOf(sessions: readonly PatternSession[], bodies: readonly number[]): Pattern[] {
  const held = pairs(sessions).filter(
    ([before, x]) => x.status === 'skipped' && before.body !== null && isLowBody(before.body, bodies),
  ).length;
  return heldPattern('body-push-back', 'body', { pairs: held }, held);
}

/** The old rule that needs only ratings and Session Type, on the robust baseline and the stored, capitalised type. */
function lowBodyAfterIntensityOf(sessions: readonly PatternSession[], bodies: readonly number[]): Pattern[] {
  const held = pairs(sessions).filter(
    ([before, x]) => before.type === 'Intensity' && x.body !== null && isLowBody(x.body, bodies),
  ).length;
  return heldPattern('low-body-after-intensity', 'Intensity', { times: held }, held);
}

/** The dormant rules' own thresholds, kept from the first version until real data can tune them. */
const DORMANT = { poorSleepHours: 6, lowSleepMoodHours: 6.5, elevatedPulseBpm: 65 } as const;

/**
 * The three rules that read sleep, resting pulse and push-back. Nothing records
 * those yet, so they return nothing; they wake the day `training-architecture/51`
 * stores them (Mads, 2026-09-26: they stay in the code, as code-detected rules).
 */
function dormantOf(sessions: readonly PatternSession[]): Pattern[] {
  const count = (holds: (x: PatternSession) => boolean) => sessions.filter(holds).length;
  const sleepIntensity = count(
    (x) => (x.sleepHours ?? Infinity) < DORMANT.poorSleepHours && x.pushedBack === true && x.type === 'Intensity',
  );
  const pulse = count((x) => (x.restingPulse ?? -Infinity) >= DORMANT.elevatedPulseBpm && x.pushedBack === true);
  const sleepMind = count(
    (x) => (x.sleepHours ?? Infinity) < DORMANT.lowSleepMoodHours && x.mind !== null && x.mind <= T.lowRating,
  );
  return [
    ...heldPattern('sleep-intensity', 'sleep', { times: sleepIntensity }, sleepIntensity),
    ...heldPattern('pulse-push-back', 'resting pulse', { times: pulse }, pulse),
    ...heldPattern('sleep-mind', 'sleep', { times: sleepMind }, sleepMind),
  ];
}

export function detectPatterns(input: {
  sessions: readonly PatternSession[];
  moves: readonly PatternMove[];
  today: string;
}): Pattern[] {
  if (!hasEnoughHistory(input.sessions)) return [];
  const { sessions, today } = input;
  const bodies = sessions.flatMap((x) => (x.body === null ? [] : [x.body]));
  return (['body', 'mind'] as const).flatMap((metric) => [
    ...shiftOf(sessions, metric, today),
    ...kindOf(sessions, metric),
  ]).concat(
    skipsOf(sessions),
    movesOf(input.moves),
    pushBackOf(sessions, bodies),
    lowBodyAfterIntensityOf(sessions, bodies),
    dormantOf(sessions),
    effortDriftOf(sessions, today),
  );
}

/** Ruling 8: Momentum is handed the strongest few, recomputed every time; nothing is remembered. */
export function topPatterns(found: readonly Pattern[], n = 3): Pattern[] {
  return [...found].sort((a, b) => b.strength - a.strength).slice(0, n);
}

/**
 * Ruling 10: the Briefing respects Link Visibility. A pattern built from the
 * athlete's reports (ratings, and Garmin data per Mads 2026-10-01) reaches the
 * coach only when the athlete shares reports; schedule patterns are built from
 * statuses and moves, which the coach always sees.
 */
export function visiblePatterns(found: readonly Pattern[], visibility: LinkVisibility): Pattern[] {
  return canSeeAthleteReports(visibility) ? [...found] : found.filter((p) => p.section === 'always');
}

/** A stored session as Pattern Insight reads it: no title, no note, no comment ever enters. */
export function patternHistoryOf(sessions: readonly Session[]): PatternSession[] {
  return sessions.map((x) => ({
    date: x.date,
    type: x.type,
    sport: x.sport,
    status: x.status,
    duration: x.duration,
    body: x.feedbackBody,
    mind: x.feedbackMind,
    avgHr: x.summary?.avgHr ?? null,
    distanceM: x.summary?.distanceM ?? null,
  }));
}

