import { describe, it, expect } from 'vitest';
import type { Athlete } from '@/features/athlete/athlete';
import type { Session } from '@/features/session/session';
import type { Message } from './conversation';
import {
  buildWeeklyCheckIn,
  proposalDateRange,
  proposedToNewSessionRows,
  reflectionScoreToTen,
  skippedFrom,
  toWeeklyApiMessages,
  validateProposedPlan,
  weekFeedbackFrom,
  WEEKLY_OPENER,
  type ProposedSession,
  type Readiness,
} from './weekly-session';

const READINESS: Readiness = { body: 7, mental: 6, energy: 8, sleep: 7.5, pulse: 52 };

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 'athlete_1',
    syntheticLabel: null,
    trainingPhase: 'Base Building',
    experienceLevel: 'intermediate',
    communicationStyle: 'direct',
    raceTarget: 'Ironman Copenhagen',
    trainingSessionsPerWeek: 6,
    profile: {
      onboarding: { motivation: 'Completion' },
      fixedConstraints: ['Sunday'],
      weeklySessionDay: 'Monday',
    },
    ...overrides,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    date: '2026-07-13',
    type: 'Endurance',
    status: 'completed',
    // Slice 14 added `parked` to the Session domain type: a session on an
    // Unavailable Date is parked in place rather than moved.
    parked: false,
    dayOrder: 0,
    version: 1,
    title: null,
    duration: 60,
    zone: 'Z2',
    note: null,
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    origin: 'coach',
    isTraining: true,
    ...overrides,
  };
}

describe('buildWeeklyCheckIn', () => {
  it('maps the opaque profile and readiness, with no identity', () => {
    const checkIn = buildWeeklyCheckIn(athlete(), READINESS, 3, 'da');
    expect(checkIn).toMatchObject({
      readiness: READINESS,
      phase: 'Base Building',
      experienceLevel: 'intermediate',
      commStyle: 'direct',
      raceTarget: 'Ironman Copenhagen',
      language: 'da',
      fixedConstraints: ['Sunday'],
      weeklySessionDay: 'Monday',
      weeklySessionNumber: 3,
    });
    // No name/email fields on the check-in — personaName is never set from data.
    expect(checkIn.personaName).toBeUndefined();
    expect(JSON.stringify(checkIn)).not.toContain('@');
  });

  it('defaults language to English when the user has not chosen one', () => {
    const checkIn = buildWeeklyCheckIn(athlete({ profile: null }), READINESS, 1);
    expect(checkIn.language).toBe('en');
    expect(checkIn.onboarding).toBeUndefined();
  });

  it('carries the equipment items passed in, defaulting to none', () => {
    expect(buildWeeklyCheckIn(athlete(), READINESS, 1).equipment).toEqual([]);

    const items = [
      { id: 'e1', category: 'bike' as const, name: 'Canyon Speedmax', details: null, addedDate: '2026-08-01' },
    ];
    const checkIn = buildWeeklyCheckIn(athlete(), READINESS, 1, undefined, items);
    expect(checkIn.equipment).toEqual(items);
  });

  it('sets sessionCount to coaching-relationship depth, not weekly frequency', () => {
    // trainingSessionsPerWeek is 6 in the fixture; `sessions=` must be the count
    // of prior Weekly Sessions, never the 6-a-week cadence.
    expect(buildWeeklyCheckIn(athlete(), READINESS, 1).sessionCount).toBe(0);
    expect(buildWeeklyCheckIn(athlete(), READINESS, 4).sessionCount).toBe(3);
  });

  it('fails closed when an identifier would reach a prompt', () => {
    // Deep leaf, not a top-level field — the realistic hiding place.
    const leaky = athlete({
      profile: {
        onboarding: { motivation: 'reach me at mads@example.com' },
      },
    });
    expect(() => buildWeeklyCheckIn(leaky, READINESS, 1)).toThrow(/identifier/i);
  });
});

describe('reflectionScoreToTen', () => {
  it('maps the 1–5 smiley scale onto tenths', () => {
    expect(reflectionScoreToTen(1)).toBe(1);
    expect(reflectionScoreToTen(3)).toBe(6);
    expect(reflectionScoreToTen(5)).toBe(10);
  });
});

describe('weekFeedbackFrom', () => {
  it('includes only rated sessions and scales their scores', () => {
    const feedback = weekFeedbackFrom([
      session({ id: 'a', feedbackBody: 5, feedbackMind: 3, feedbackComment: 'strong' }),
      session({ id: 'b', feedbackBody: null, feedbackMind: null }),
    ]);
    expect(feedback).toEqual([
      {
        dateKey: '2026-07-13',
        sessionType: 'Endurance',
        body: 10,
        mind: 6,
        comment: 'strong',
      },
    ]);
  });
});

describe('skippedFrom', () => {
  it('lists skipped sessions as date + type', () => {
    expect(
      skippedFrom([
        session({ status: 'skipped', type: 'Recovery' }),
        session({ status: 'completed' }),
      ]),
    ).toEqual([{ date: '2026-07-13', sessionType: 'Recovery' }]);
  });
});

describe('toWeeklyApiMessages', () => {
  it('opens with the user primer then alternates from the transcript', () => {
    const transcript: Message[] = [
      { id: 'm0', role: 'coach_ai', content: 'Welcome.', seq: 0, createdAt: new Date() },
      { id: 'm1', role: 'athlete', content: 'In rhythm.', seq: 1, createdAt: new Date() },
    ];
    expect(toWeeklyApiMessages(transcript)).toEqual([
      { role: 'user', content: WEEKLY_OPENER },
      { role: 'assistant', content: 'Welcome.' },
      { role: 'user', content: 'In rhythm.' },
    ]);
  });
});

describe('validateProposedPlan', () => {
  const TODAY = '2026-07-29';

  it('accepts a well-formed proposal spanning two calendar weeks', () => {
    const result = validateProposedPlan(
      {
        sessions: [
          { date: '2026-07-29', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy' },
          { date: '2026-08-05', type: 'Intensity', durationMinutes: 45, zone: 'Z4', note: '' },
        ],
      },
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      sessions: [
        { date: '2026-07-29', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy' },
        // An empty note normalises to null.
        { date: '2026-08-05', type: 'Intensity', durationMinutes: 45, zone: 'Z4', note: null },
      ],
    });
  });

  it('is malformed when there is no sessions array', () => {
    expect(validateProposedPlan(null, TODAY)).toEqual({ ok: false, reason: 'malformed' });
    expect(validateProposedPlan({ sessions: 'nope' }, TODAY)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('drops a past date, an impossible date, and an unknown type', () => {
    const result = validateProposedPlan(
      {
        sessions: [
          { date: '2026-07-28', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: '' }, // past
          { date: '2026-02-30', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: '' }, // impossible
          { date: '2026-07-30', type: 'Rest', durationMinutes: 0, zone: '', note: '' }, // bad type
          { date: '2026-07-31', type: 'Tempo', durationMinutes: 50, zone: 'Z3', note: 'ok' }, // valid
        ],
      },
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      sessions: [{ date: '2026-07-31', type: 'Tempo', durationMinutes: 50, zone: 'Z3', note: 'ok' }],
    });
  });

  it('is empty when nothing valid survives', () => {
    const result = validateProposedPlan(
      { sessions: [{ date: '2020-01-01', type: 'Endurance', durationMinutes: 60, zone: '', note: '' }] },
      TODAY,
    );
    expect(result).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects a non-positive or absurd duration to null', () => {
    const result = validateProposedPlan(
      {
        sessions: [
          { date: '2026-07-29', type: 'Endurance', durationMinutes: 0, zone: 'Z2', note: '' },
          { date: '2026-07-30', type: 'Endurance', durationMinutes: 100000, zone: 'Z2', note: '' },
        ],
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sessions.map((s) => s.durationMinutes)).toEqual([null, null]);
  });
});

describe('proposalDateRange', () => {
  it('spans the earliest to the latest date, unsorted input', () => {
    const sessions: ProposedSession[] = [
      { date: '2026-08-02', type: 'Endurance', durationMinutes: null, zone: null, note: null },
      { date: '2026-07-29', type: 'Intensity', durationMinutes: null, zone: null, note: null },
      { date: '2026-07-31', type: 'Tempo', durationMinutes: null, zone: null, note: null },
    ];
    expect(proposalDateRange(sessions)).toEqual({ start: '2026-07-29', end: '2026-08-02' });
  });
});

describe('proposedToNewSessionRows', () => {
  it('maps dated sessions to coach-planned rows, keeping Double order', () => {
    const rows = proposedToNewSessionRows(
      [
        { date: '2026-07-29', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy' },
        { date: '2026-07-30', type: 'Endurance', durationMinutes: null, zone: null, note: null },
        { date: '2026-07-30', type: 'Recovery', durationMinutes: null, zone: null, note: null },
      ],
      'athlete_1',
    );
    expect(rows).toEqual([
      {
        athleteId: 'athlete_1',
        date: '2026-07-29',
        type: 'Endurance',
        origin: 'coach',
        status: 'planned',
        duration: 60,
        zone: 'Z2',
        note: 'easy',
        dayOrder: 0,
      },
      {
        athleteId: 'athlete_1',
        date: '2026-07-30',
        type: 'Endurance',
        origin: 'coach',
        status: 'planned',
        duration: null,
        zone: null,
        note: null,
        dayOrder: 0,
      },
      {
        athleteId: 'athlete_1',
        date: '2026-07-30',
        type: 'Recovery',
        origin: 'coach',
        status: 'planned',
        duration: null,
        zone: null,
        note: null,
        dayOrder: 1,
      },
    ]);
  });
});

// code-health/07 — a check-in built with no readiness must carry none. The
// alternative the app shipped was a hardcoded 7/7/7/7.5/55, which made every
// athlete read as equally, mildly fine and contradicted anyone who said
// otherwise in words.
describe('buildWeeklyCheckIn — readiness the athlete never gave', () => {
  it('carries no readiness at all when there is no Check-in', () => {
    const checkIn = buildWeeklyCheckIn(athlete(), null, 1);

    expect(checkIn.readiness).toBeUndefined();
    // Absent, not present-and-undefined: an explicit `readiness: undefined`
    // would still be a key something could reach into and render.
    expect('readiness' in checkIn).toBe(false);
  });

  it('keeps the facts that are real', () => {
    const checkIn = buildWeeklyCheckIn(athlete(), null, 3);

    expect(checkIn.phase).toBe('Base Building');
    expect(checkIn.experienceLevel).toBe('intermediate');
    expect(checkIn.sessionCount).toBe(2);
  });

  it('carries the whole report when a real Check-in supplied one', () => {
    // All five together, because a Check-in is one report. There is deliberately
    // no test for a partial readiness: `Readiness` requires all five, so a
    // half-filled one does not compile — which is the point of nesting it rather
    // than hanging five optional fields off CheckIn.
    const checkIn = buildWeeklyCheckIn(athlete(), READINESS, 1);

    expect(checkIn.readiness).toEqual(READINESS);
  });
});
