import { describe, it, expect } from 'vitest';
import {
  generateSyntheticHistory,
  toSessionHistory,
  SYNTHETIC_PROFILES,
  toAthleteRow,
  toSessionRows,
} from './synthetic-history';
import { detectPatterns } from '@/features/coach/pattern-insight';

/**
 * The generator behind the two athletes a Head Coach evaluates the product
 * against (showable-version/03).
 *
 * Every assertion here is about the *data*, never about a database — that
 * separation is the reason this module exists as a pure function with the seed
 * script as a thin caller. A Head Coach judging whether the Coach Briefing tells
 * them something they did not already know cannot do it against thin data, and
 * "is the data thick enough" is a question a test can answer.
 *
 * The clock and the randomness are both parameters. A generator reaching for
 * `Math.random()` or `new Date()` would make "the two athletes differ" pass
 * intermittently and mean nothing, and would reshape the roster on every reseed.
 */

// A Wednesday, so the week-boundary arithmetic is exercised off a midweek day
// rather than accidentally landing on a Monday and hiding an off-by-one.
const TODAY = new Date(2026, 8, 2);

const generate = (profile = SYNTHETIC_PROFILES[0], weeks = 10) =>
  generateSyntheticHistory(profile, weeks, TODAY, 1234);

describe('generateSyntheticHistory', () => {
  it('lays sessions across the requested weeks without a uniform grid', () => {
    const { sessions } = generate(SYNTHETIC_PROFILES[0], 10);

    const byWeek = new Map<number, number>();
    for (const s of sessions) {
      const days = Math.floor(
        (TODAY.getTime() - new Date(s.date).getTime()) / 86_400_000,
      );
      const week = Math.floor(days / 7);
      byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
    }

    // Every week is represented — a history with holes in it is not a history.
    expect(byWeek.size).toBe(10);
    // ...and they are not all the same size. A uniform grid is the tell of
    // generated data, and it is what the ticket asks not to produce.
    expect(new Set(byWeek.values()).size).toBeGreaterThan(1);
  });

  it('dates every session in the past', () => {
    const { sessions } = generate();
    const todayKey = '2026-09-02';
    for (const s of sessions) expect(s.date < todayKey).toBe(true);
  });

  it('rates most sessions, varies the scores, and comments on a few', () => {
    const { sessions } = generate();

    const rated = sessions.filter((s) => s.feedbackBody !== null);
    expect(rated.length).toBeGreaterThan(sessions.length / 2);
    // Not every one: an athlete who rated everything is not a real athlete.
    expect(rated.length).toBeLessThan(sessions.length);

    const bodyScores = new Set(rated.map((s) => s.feedbackBody));
    const mindScores = new Set(rated.map((s) => s.feedbackMind));
    expect(bodyScores.size).toBeGreaterThan(2);
    expect(mindScores.size).toBeGreaterThan(2);

    const commented = sessions.filter((s) => s.feedbackComment !== null);
    expect(commented.length).toBeGreaterThan(0);
    expect(commented.length).toBeLessThan(rated.length);
    // A comment without a rating would be a reflection nobody gave.
    for (const s of commented) expect(s.feedbackBody).not.toBeNull();
  });

  it('includes skipped sessions and unavailable dates', () => {
    const { sessions, unavailableDates } = generate();

    expect(sessions.some((s) => s.status === 'skipped')).toBe(true);
    expect(unavailableDates.length).toBeGreaterThan(0);
    // US-3: a skip is never an alarm, so a skipped session carries no rating —
    // there was nothing to reflect on.
    for (const s of sessions.filter((x) => x.status === 'skipped')) {
      expect(s.feedbackBody).toBeNull();
      expect(s.feedbackMind).toBeNull();
    }
  });

  it('keeps skipping rare — most sessions were actually done', () => {
    const { sessions } = generate();
    const skipped = sessions.filter((s) => s.status === 'skipped');
    // The guard on a real bug: deriving "skipped" from "unrated" turned every
    // session the athlete simply did not rate into a skip, which is roughly a
    // fifth of the history and makes a diligent athlete look like a flake.
    expect(skipped.length / sessions.length).toBeLessThan(0.2);
    expect(skipped.length).toBeGreaterThan(0);
  });

  it('leaves some completed sessions unrated', () => {
    const { sessions } = generate();
    // The other half of the same bug: a completed session with no reflection is
    // an ordinary thing, and it must stay completed.
    expect(
      sessions.some((s) => s.status === 'completed' && s.feedbackBody === null),
    ).toBe(true);
  });

  it('draws its comments from the written vocabulary', () => {
    const { sessions } = generate(SYNTHETIC_PROFILES[1], 30);
    const used = new Set(
      sessions.map((s) => s.feedbackComment).filter((c): c is string => c !== null),
    );
    // Pins the copy itself. These are the words a Head Coach reads on the
    // Roster, so they are content, not filler — and without this the strings are
    // free to rot into anything.
    expect([...used].sort()).toEqual(
      [
        'Better than last week, still cautious on the descents.',
        'Easy day done easy for once.',
        'Felt strong the whole way.',
        'Held the numbers but it cost me.',
        'Legs never really woke up.',
      ].filter((c) => used.has(c)),
    );
    expect(used.size).toBe(5);
  });

  it('never puts a session and an unavailable date on the same day', () => {
    const { sessions, unavailableDates } = generate();
    const blocked = new Set(unavailableDates);
    for (const s of sessions) expect(blocked.has(s.date)).toBe(false);
  });

  it('plants a correlation Pattern Insight can actually find', () => {
    for (const profile of SYNTHETIC_PROFILES) {
      const { sessions } = generateSyntheticHistory(profile, 10, TODAY, 1234);
      // Through the real detector, on the real shape it consumes. Asserting the
      // data "looks correlated" would prove nothing about what the Coach sees.
      expect(detectPatterns(toSessionHistory(sessions)).length).toBeGreaterThan(0);
    }
  });

  it('emits only values the database will accept', () => {
    for (const profile of SYNTHETIC_PROFILES) {
      const { sessions } = generateSyntheticHistory(profile, 10, TODAY, 1234);
      for (const s of sessions) {
        // The guards are check constraints, so a bad value fails at insert time
        // in the seed rather than here. Pinning them keeps that failure out of a
        // run Mads is watching.
        expect(['coach', 'athlete', 'garmin', 'head_coach']).toContain(s.origin);
        expect(['planned', 'completed', 'skipped', 'unavailable']).toContain(s.status);
        for (const score of [s.feedbackBody, s.feedbackMind]) {
          if (score !== null) {
            expect(score).toBeGreaterThanOrEqual(1);
            expect(score).toBeLessThanOrEqual(5);
          }
        }
        expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  // The generator is deterministic, so its output can be pinned exactly — and
  // for generated data that is the test that carries the weight. The property
  // assertions above say the shape is right; only this says the *numbers* are,
  // and without it every threshold, duration and comment string in the module is
  // unchecked. Mutation testing is what made that concrete: property assertions
  // alone left 57 of 145 mutants alive, which is 57 changes to this file that no
  // test would have noticed.
  //
  // Meant to be updated with `vitest -u` when the data is deliberately reshaped,
  // and the diff read as the review artifact — it shows exactly what the Head
  // Coach will be looking at. A snapshot that changes in a commit that did not
  // mean to change the roster is the bug this pins.
  it.each(SYNTHETIC_PROFILES.map((p) => [p.syntheticLabel, p] as const))(
    'renders %s identically',
    (_label, profile) => {
      expect(generateSyntheticHistory(profile, 10, TODAY, 1234)).toMatchSnapshot();
    },
  );

  it('is deterministic for the same seed and clock', () => {
    const a = generateSyntheticHistory(SYNTHETIC_PROFILES[0], 10, TODAY, 99);
    const b = generateSyntheticHistory(SYNTHETIC_PROFILES[0], 10, TODAY, 99);
    expect(a).toEqual(b);
  });

  it('gives a different history for a different seed', () => {
    const a = generateSyntheticHistory(SYNTHETIC_PROFILES[0], 10, TODAY, 1);
    const b = generateSyntheticHistory(SYNTHETIC_PROFILES[0], 10, TODAY, 2);
    expect(a).not.toEqual(b);
  });
});

describe('toSessionHistory', () => {
  it('hands the detector only completed sessions', () => {
    const { sessions } = generate();
    const history = toSessionHistory(sessions);
    // A skip is not evidence about the athlete's body — it is the absence of
    // evidence, and feeding it in as a session would let a skipped week read as
    // a bad week.
    expect(history).toHaveLength(
      sessions.filter((s) => s.status === 'completed').length,
    );
  });

  it('omits a score the athlete never gave, rather than sending a null', () => {
    const { sessions } = generate();
    const unrated = sessions.find(
      (s) => s.status === 'completed' && s.feedbackBody === null,
    );
    expect(unrated).toBeDefined();

    const item = toSessionHistory([unrated!])[0];
    // `SessionHistoryItem`'s fields are optional and the detector tests them
    // with `!== undefined`. A present-but-null score would pass that test and
    // then be compared as a number, which is how a rating nobody gave becomes a
    // pattern about them.
    expect('bodyFeedback' in item).toBe(false);
    expect('mindFeedback' in item).toBe(false);
    expect(item.sessionType).toBe(unrated!.type.toLowerCase());
  });

  it('carries the scores through when they exist', () => {
    const { sessions } = generate();
    const rated = sessions.find((s) => s.feedbackBody !== null)!;
    const item = toSessionHistory([rated])[0];
    expect(item.bodyFeedback).toBe(rated.feedbackBody);
    expect(item.mindFeedback).toBe(rated.feedbackMind);
  });
});

describe('the two shipped profiles', () => {
  it('are two athletes, not one profile with the numbers moved', () => {
    const [first, second] = SYNTHETIC_PROFILES;

    // The product's claim is that the Coach adapts, and that claim is only
    // demonstrable against two athletes who genuinely differ.
    expect(first.experienceLevel).not.toBe(second.experienceLevel);
    expect(first.trainingPhase).not.toBe(second.trainingPhase);
    expect(first.raceTarget).not.toBe(second.raceTarget);
    expect(first.id).not.toBe(second.id);
  });

  it('train at different volumes and in different proportions', () => {
    const [a, b] = SYNTHETIC_PROFILES.map(
      (p) => generateSyntheticHistory(p, 10, TODAY, 1234).sessions,
    );

    const minutes = (rows: typeof a) =>
      rows.reduce((sum, s) => sum + (s.duration ?? 0), 0);
    const share = (rows: typeof a, type: string) =>
      rows.filter((s) => s.type === type).length / rows.length;

    // A veteran in Build carries materially more load than a first-timer twelve
    // weeks out. "Materially" is the point: a 5% gap would not read as two
    // different athletes to anyone looking at the Roster.
    const [lighter, heavier] = [minutes(a), minutes(b)].sort((x, y) => x - y);
    expect(heavier).toBeGreaterThan(lighter * 1.4);

    // And they are not the same week shape at a different scale. The first-timer
    // does proportionally less intensity, which is what makes the Coach's two
    // briefings read differently.
    expect(Math.abs(share(a, 'Intensity') - share(b, 'Intensity'))).toBeGreaterThan(
      0.05,
    );
  });

  it('map to an athlete row that cannot sign in', () => {
    for (const p of SYNTHETIC_PROFILES) {
      const row = toAthleteRow(p);
      // athlete_identity_source checks (user_id IS NULL) <> (synthetic_label IS
      // NULL), so a userId here is not a style question — the insert would be
      // rejected by Postgres. Asserting its absence keeps that failure out of a
      // seed run rather than discovering it against a live database.
      expect(row.syntheticLabel).toBe(p.syntheticLabel);
      expect('userId' in row).toBe(false);
      expect(row.id).toBe(p.id);
      expect(row.experienceLevel).toBe(p.experienceLevel);
      expect(row.raceTarget).toBe(p.raceTarget);
    }
  });

  it('map to session rows scoped to their own athlete', () => {
    const profile = SYNTHETIC_PROFILES[1];
    const { sessions } = generateSyntheticHistory(profile, 10, TODAY, 1234);
    const rows = toSessionRows(profile, sessions);

    expect(rows).toHaveLength(sessions.length);
    for (const row of rows) {
      expect(row.athleteId).toBe(profile.id);
      expect(row.origin).toBe('coach');
      expect(row.isTraining).toBe(true);
      // ratedAt is what marks a Session Reflection as given; a row with scores
      // and no timestamp reads as never rated.
      expect(row.ratedAt === null).toBe(row.feedbackBody === null);
    }
  });

  it('carry no real identity, only a fabricated label', () => {
    for (const p of SYNTHETIC_PROFILES) {
      // ADR 0006: syntheticLabel is the one place a name may sit in a training
      // table, and it names nobody real.
      expect(p.syntheticLabel).toBeTruthy();
      const { sessions } = generateSyntheticHistory(p, 10, TODAY, 1234);
      const text = JSON.stringify(sessions);
      expect(text).not.toContain('@');
      expect(text).not.toContain(p.syntheticLabel);
    }
  });
});
