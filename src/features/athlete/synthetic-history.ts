import type { NewInjuryRow } from '@/db/schema';
import type { RaceDistance } from '@/lib/race-distances';
import { addDays, dateKey } from '@/lib/date';
import type { SessionHistoryItem } from '@/features/coach/check-in';
import type { PlanType } from '@/features/coach/weekly-session';
import type { Capacity } from '@/features/health/capacity';
import { uuidV5 } from './uuid-v5';

/**
 * The training history behind the generated athletes a Head Coach tester
 * finds on the Roster (showable-version/03, code-health/16).
 *
 * **Behind a flag since 2026-09-18.** code-health/13 retired the two personas
 * from the seed's default path — fabricated data in a product about to be
 * handed to real people, and a tax on every slice touching the athlete shape.
 * code-health/16 wired them back for the Head Coach tester round only:
 * `npm run seed -- --with-personas` writes them, the flag-less seed does not,
 * and `scripts/retire-personas.ts` removes the rows afterwards. A Head Coach
 * tester with one athlete cannot judge the Roster or the Briefing, so the
 * round gets three athletes who genuinely differ — a clean beginner, a
 * high-volume veteran, and Nadia Holm six weeks out with an open Injury and a
 * fortnight of missed sessions, so the injury surfaces and the Briefing have
 * something to say.
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
  /** Whether the session counts as load. Every generated type is training. */
  isTraining: boolean;
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
  raceTarget: string;
  /**
   * The Target Race, as a real date and distance rather than prose
   * (`training-architecture/02`). These are what the seeded Race row carries,
   * and what the Training Phase is derived from now that it is not stored —
   * without them these athletes would have no horizon at all, and the Roster
   * would show athletes the Coach plans identically.
   *
   * A fixed `YYYY-MM-DD`, or a distance from the seed's clock. Nadia's race is
   * `{ weeksOut: 6 }` rather than a date because the point of her is *where
   * she stands*: the phase is derived from today and the race (03), so a
   * stored date would walk her out of the last block a week at a time, and
   * a reseed in November would find her race in the past. Resolved by
   * {@link raceDateFor}.
   */
  raceDate: string | { weeksOut: number };
  raceDistance: RaceDistance;
  /**
   * An open Injury, or none — the athlete-facing record only (ADR 0011): what
   * it prevents per discipline and a Bother Rating, never a detail thread. The
   * seed cannot write free text about a body, and a persona has no physio.
   * Every session dated since it opened is a miss, which is what makes the
   * Briefing's "missed sessions" true rather than planted. `id` is fixed so a
   * reseed replaces the row rather than opening a second injury.
   */
  injury?: {
    id: string;
    capacity: Capacity;
    /** How many days before the seed's `today` it opened. */
    daysOpen: number;
    bother: number;
  };
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
 * Three athletes who are meant to read as three people.
 *
 * A first-timer nine months out, a veteran deep in a high-volume build, and an
 * intermediate six weeks from an Olympic-distance race who has just stopped
 * training on an injury put different words in the Coach's mouth, and that
 * contrast *is* the demonstration — so the difference is deliberate in every
 * field a prompt reads: experience, horizon (and so the derived phase), race,
 * Communication Style, volume, the proportion of hard work in a week, and
 * whether the body currently allows any of it.
 *
 * All keep `userId` null and carry a fabricated `syntheticLabel`. That is the
 * one place a name may sit in a training table (ADR 0006) and it names nobody
 * real. The database enforces the rest: `athlete_identity_source` checks that
 * exactly one of `user_id` and `synthetic_label` is set, so none of these can
 * acquire a login by accident.
 */
export const SYNTHETIC_PROFILES: readonly SyntheticProfile[] = [
  {
    id: 'b1e7c0d2-3f4a-4b5c-8d6e-7f8a9b0c1d2e',
    syntheticLabel: 'Alex Rivera',
    experienceLevel: 'beginner',
    raceTarget: 'First Ironman 70.3',
    raceDate: '2027-06-19',
    raceDistance: 'Half',
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
    raceTarget: 'Ironman Copenhagen — sub 10:30',
    raceDate: '2027-08-21',
    raceDistance: 'Full',
    communicationStyle:
      'The athlete is a veteran Ironman athlete. Tracks Heart Rate, Power. Use data-aware language. Be direct and performance-focused. Skip beginner explanations entirely.',
    sessionsPerWeek: 6,
    durations: { Endurance: 110, Recovery: 45, Tempo: 70, Intensity: 60 },
    week: ['Intensity', 'Endurance', 'Tempo', 'Intensity', 'Endurance', 'Recovery'],
  },
  {
    id: 'd3a9e2f4-5b6c-4d7e-8f90-2b3c4d5e6f7a',
    syntheticLabel: 'Nadia Holm',
    experienceLevel: 'intermediate',
    raceTarget: 'Olympic distance — a personal best on the run',
    raceDate: { weeksOut: 6 },
    raceDistance: 'Olympic',
    communicationStyle:
      'The athlete is an experienced age-grouper six weeks from an Olympic-distance race, currently unable to run. Be candid about what the injury changes for race day and what it does not. Plan around it, never diagnose it.',
    sessionsPerWeek: 5,
    durations: { Endurance: 75, Recovery: 40, Tempo: 55, Intensity: 50 },
    week: ['Intensity', 'Endurance', 'Tempo', 'Recovery', 'Endurance'],
    injury: {
      id: 'e4b0f3a5-6c7d-4e8f-9a01-3c4d5e6f7a8b',
      // A running injury: the discipline a triathlete can least fake, and the
      // one that reshapes a week rather than emptying it (capacity.ts).
      capacity: { swim: 'full', bike: 'easy', run: 'none' },
      daysOpen: 12,
      bother: 3,
    },
  },
] as const;

/** The persona names, in profile order — what a Roster shows and what retirement looks for. */
export const PERSONA_LABELS: readonly string[] = SYNTHETIC_PROFILES.map((p) => p.syntheticLabel);

/**
 * The namespace every owner's persona copy derives its ids from. Minted once
 * (2026-09-22) and pinned by a snapshot: changing it re-keys every tester
 * coach's copy on their next mint and orphans the rows they already have.
 */
const PERSONA_NAMESPACE = 'c084aebc-17a7-4c24-a5c2-053def42cf6a';

/** The owner whose copy is the seed's own — today's fixed ids, untouched. */
export const SEED_OWNER = 'seed';

/**
 * The three personas as one owner's copy (code-health/18). Two tester Head
 * Coaches must never share a Nadia — one's drafts would land in the other's
 * Briefing — so each coach gets rows of their own, keyed by the owner. Same
 * content, own athlete and injury ids, stable per owner so a re-mint replaces
 * rather than duplicates. `SEED_OWNER` returns `SYNTHETIC_PROFILES` itself.
 */
export function personasFor(ownerKey: string): readonly SyntheticProfile[] {
  if (ownerKey === SEED_OWNER) return SYNTHETIC_PROFILES;
  return SYNTHETIC_PROFILES.map((p) => ({
    ...p,
    id: uuidV5(PERSONA_NAMESPACE, `${ownerKey}:${p.syntheticLabel}`),
    ...(p.injury
      ? { injury: { ...p.injury, id: uuidV5(PERSONA_NAMESPACE, `${ownerKey}:${p.syntheticLabel}:injury`) } }
      : {}),
  }));
}

/**
 * The Target Race's date for this profile on this clock — the stored date, or
 * `weeksOut` weeks from `today`.
 */
export function raceDateFor(profile: SyntheticProfile, today: Date): string {
  if (typeof profile.raceDate === 'string') return profile.raceDate;
  return addDays(dateKey(today), profile.raceDate.weeksOut * 7);
}

/**
 * The open Injury row the seed writes for this profile, or null for a clean
 * one. The athlete-facing record only (ADR 0011): capacity per discipline and
 * a Bother Rating; no note, no thread, nothing free-text. `closedAt` is null
 * because open *is* the absence of an end (health-repository.ts).
 */
export function openInjuryFor(profile: SyntheticProfile, today: Date): NewInjuryRow | null {
  if (!profile.injury) return null;
  const { id, capacity, daysOpen, bother } = profile.injury;
  return {
    id,
    athleteId: profile.id,
    ...capacity,
    bother,
    openedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysOpen),
    closedAt: null,
  };
}

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
    isTraining: true,
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
 * Whether the athlete missed this session.
 *
 * Every session from the day the profile's Injury opened is a miss — checked
 * before the draw, so the clean personas' random sequence is untouched and
 * their pinned histories hold. Otherwise a real week is not clean, and US-3
 * says a skip is never an alarm.
 */
function missedSession(
  profile: SyntheticProfile,
  today: Date,
  date: string,
  random: () => number,
): boolean {
  if (profile.injury !== undefined && date >= dayKey(today, profile.injury.daysOpen)) return true;
  // Stryker disable next-line EqualityOperator — `<` vs `<=` on a continuous
  // draw; identical unless a draw is exactly 0.08.
  return random() < 0.08;
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

      const skipped = missedSession(profile, today, date, random);
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
    communicationStyle: profile.communicationStyle,
    raceTarget: profile.raceTarget,
    raceDistance: profile.raceDistance,
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
    // Carried, not asserted: the row said `true` regardless of the session
    // until code-health/13 — true by coincidence, since every generated type is
    // training, and wrong the day one is not.
    isTraining: s.isTraining,
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
