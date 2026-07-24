import { describe, it, expect } from 'vitest';
import type { Athlete } from '@/features/athlete/athlete';
import type { Session } from '@/features/session/session';
import type { Message } from './conversation';
import {
  buildWeeklyCheckIn,
  parseDurationMinutes,
  parsePlanSessions,
  planToNewSessionRows,
  reflectionScoreToTen,
  skippedFrom,
  toApiMessages,
  transcriptToText,
  weekFeedbackFrom,
  WEEKLY_OPENER,
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
    equipment: { bikeType: 'TT' },
    ...overrides,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    date: '2026-07-13',
    type: 'Endurance',
    status: 'completed',
    dayOrder: 0,
    title: null,
    duration: 60,
    zone: 'Z2',
    note: null,
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    ...overrides,
  };
}

describe('buildWeeklyCheckIn', () => {
  it('maps the opaque profile and readiness, with no identity', () => {
    const checkIn = buildWeeklyCheckIn(athlete(), READINESS, 3, 'da');
    expect(checkIn).toMatchObject({
      body: 7,
      mental: 6,
      energy: 8,
      sleep: 7.5,
      pulse: 52,
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

describe('toApiMessages', () => {
  it('opens with the user primer then alternates from the transcript', () => {
    const transcript: Message[] = [
      { id: 'm0', role: 'coach_ai', content: 'Welcome.', seq: 0, createdAt: new Date() },
      { id: 'm1', role: 'athlete', content: 'In rhythm.', seq: 1, createdAt: new Date() },
    ];
    expect(toApiMessages(transcript)).toEqual([
      { role: 'user', content: WEEKLY_OPENER },
      { role: 'assistant', content: 'Welcome.' },
      { role: 'user', content: 'In rhythm.' },
    ]);
  });
});

describe('transcriptToText', () => {
  it('labels each turn Coach or Athlete', () => {
    const transcript: Message[] = [
      { id: 'm0', role: 'coach_ai', content: 'Plan?', seq: 0, createdAt: new Date() },
      { id: 'm1', role: 'athlete', content: 'Yes', seq: 1, createdAt: new Date() },
    ];
    expect(transcriptToText(transcript)).toBe('Coach: Plan?\nAthlete: Yes');
  });
});

describe('parsePlanSessions', () => {
  it('parses a plain JSON array', () => {
    const items = parsePlanSessions(
      '[{"dayOfWeek":"Monday","type":"Endurance","duration":"60 min","zone":"Z2","note":"easy"}]',
    );
    expect(items).toEqual([
      { dayOfWeek: 'Monday', type: 'Endurance', duration: '60 min', zone: 'Z2', note: 'easy' },
    ]);
  });

  it('tolerates code fences, labelled or bare', () => {
    const labelled = parsePlanSessions('```json\n[{"dayOfWeek":"Tuesday","type":"Rest"}]\n```');
    expect(labelled).toEqual([
      { dayOfWeek: 'Tuesday', type: 'Rest', duration: null, zone: null, note: null },
    ]);
    // A bare fence carries no label — it must strip too, or the plan reads as
    // unparseable when the model omits the language hint.
    const bare = parsePlanSessions('```\n[{"dayOfWeek":"Tuesday","type":"Rest"}]\n```');
    expect(bare).toEqual(labelled);
  });

  it('returns null when the text is not a JSON array', () => {
    expect(parsePlanSessions('Sorry, I could not extract a plan.')).toBeNull();
    expect(parsePlanSessions('{"dayOfWeek":"Monday"}')).toBeNull();
  });

  it('drops rows with an unknown day or type', () => {
    const items = parsePlanSessions(
      '[{"dayOfWeek":"Someday","type":"Endurance"},{"dayOfWeek":"Monday","type":"Nonsense"},{"dayOfWeek":"Monday","type":"Tempo"}]',
    );
    expect(items).toEqual([
      { dayOfWeek: 'Monday', type: 'Tempo', duration: null, zone: null, note: null },
    ]);
  });
});

describe('parseDurationMinutes', () => {
  it('reads the leading number', () => {
    expect(parseDurationMinutes('60 min')).toBe(60);
    expect(parseDurationMinutes('90')).toBe(90);
  });
  it('is null for empty or number-free text', () => {
    expect(parseDurationMinutes(null)).toBeNull();
    expect(parseDurationMinutes('easy spin')).toBeNull();
  });
});

describe('planToNewSessionRows', () => {
  const WEEK_START = '2026-07-13'; // a Monday

  it('maps days onto dates and skips Rest days', () => {
    const rows = planToNewSessionRows(
      [
        { dayOfWeek: 'Monday', type: 'Endurance', duration: '60 min', zone: 'Z2', note: 'easy' },
        { dayOfWeek: 'Tuesday', type: 'Rest', duration: null, zone: null, note: null },
        { dayOfWeek: 'Sunday', type: 'Intensity', duration: '45', zone: 'Z4', note: null },
      ],
      WEEK_START,
      'athlete_1',
    );
    expect(rows).toEqual([
      {
        athleteId: 'athlete_1',
        date: '2026-07-13',
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
        date: '2026-07-19',
        type: 'Intensity',
        origin: 'coach',
        status: 'planned',
        duration: 45,
        zone: 'Z4',
        note: null,
        dayOrder: 0,
      },
    ]);
  });

  it('orders a Double by array order within the day', () => {
    const rows = planToNewSessionRows(
      [
        { dayOfWeek: 'Wednesday', type: 'Endurance', duration: null, zone: null, note: null },
        { dayOfWeek: 'Wednesday', type: 'Recovery', duration: null, zone: null, note: null },
      ],
      WEEK_START,
      'athlete_1',
    );
    expect(rows.map((r) => [r.type, r.dayOrder])).toEqual([
      ['Endurance', 0],
      ['Recovery', 1],
    ]);
  });
});
