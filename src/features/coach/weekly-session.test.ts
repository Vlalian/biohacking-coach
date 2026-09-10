import { describe, it, expect } from 'vitest';
import type { Athlete } from '@/features/athlete/athlete';
import type { Session } from '@/features/session/session';
import type { Message } from './conversation';
import {
  buildWeeklyCheckIn,
  proposedToNewSessionRows,
  reflectionScoreToTen,
  skippedFrom,
  toWeeklyApiMessages,
  validateProposedPlan,
  weekFeedbackFrom,
  PROPOSE_WEEK_PLAN_TOOL_NAME,
  PROPOSE_WEEK_PLAN_TOOL,
  WEEKLY_OPENER,
  type Readiness,
} from './weekly-session';
import { planningWindow } from './planning-window';

// The Training Phase is derived from the horizon now rather than stored on the
// athlete, so these fixtures need a day and a race for one to exist at all.
const TODAY_KEY = '2026-09-09';

// Far enough out to divide into five blocks, so the derived phase is a real
// answer rather than an edge case.
const TARGET_RACE = { name: 'Ironman Copenhagen', date: '2027-06-01' };

const READINESS: Readiness = { body: 7, energy: 8, sleepQuality: 6, mental: 6, sleepHours: 7.5, restingPulse: 52 };

function athlete(overrides: Partial<Athlete> = {}): Athlete {
  return {
    id: 'athlete_1',
    syntheticLabel: null,
    experienceLevel: 'intermediate',
    communicationStyle: 'direct',
    raceTarget: 'Ironman Copenhagen',
    raceDistance: 'Full',
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
    const checkIn = buildWeeklyCheckIn(athlete(), TODAY_KEY, READINESS, 3, 'da', [], TARGET_RACE);
    expect(checkIn).toMatchObject({
      readiness: READINESS,
      // Derived from the horizon, not read from a column: the Training Phase is
      // the name of the Training Block today falls inside.
      phase: 'Block 1 of 5',
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
    const checkIn = buildWeeklyCheckIn(athlete({ profile: null }), TODAY_KEY, READINESS, 1);
    expect(checkIn.language).toBe('en');
    expect(checkIn.onboarding).toBeUndefined();
  });

  it('carries the equipment items passed in, defaulting to none', () => {
    expect(buildWeeklyCheckIn(athlete(), TODAY_KEY, READINESS, 1).equipment).toEqual([]);

    const items = [
      { id: 'e1', category: 'bike' as const, name: 'Canyon Speedmax', details: null, addedDate: '2026-08-01' },
    ];
    const checkIn = buildWeeklyCheckIn(athlete(), TODAY_KEY, READINESS, 1, undefined, items);
    expect(checkIn.equipment).toEqual(items);
  });

  it('sets sessionCount to coaching-relationship depth, not weekly frequency', () => {
    // trainingSessionsPerWeek is 6 in the fixture; `sessions=` must be the count
    // of prior Weekly Sessions, never the 6-a-week cadence.
    expect(buildWeeklyCheckIn(athlete(), TODAY_KEY, READINESS, 1).sessionCount).toBe(0);
    expect(buildWeeklyCheckIn(athlete(), TODAY_KEY, READINESS, 4).sessionCount).toBe(3);
  });

  it('fails closed when an identifier would reach a prompt', () => {
    // Deep leaf, not a top-level field — the realistic hiding place.
    const leaky = athlete({
      profile: {
        onboarding: { motivation: 'reach me at mads@example.com' },
      },
    });
    expect(() => buildWeeklyCheckIn(leaky, TODAY_KEY, READINESS, 1)).toThrow(/identifier/i);
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

  // A Session Reflection is two scores and the pair is what makes it a reflection.
  // Half of one is not "partly rated" - it is a session the athlete started
  // rating and did not finish, and averaging or defaulting the missing half
  // would put a number the athlete never gave in front of the Coach.
  it('excludes a session rated on only one of the two scales', () => {
    expect(
      weekFeedbackFrom([
        session({ id: 'body-only', feedbackBody: 4, feedbackMind: null }),
        session({ id: 'mind-only', feedbackBody: null, feedbackMind: 4 }),
      ]),
    ).toEqual([]);
  });
});

describe('the propose_week_plan tool contract', () => {
  // The name is not an internal identifier: Anthropic echoes it back on a tool
  // call, and the service finds the call by matching it. Renaming the constant
  // alone would keep every internal use consistent and silently stop matching
  // what the API actually sends, so the literal is pinned here.
  it('names the tool exactly propose_week_plan, on both the constant and the schema', () => {
    expect(PROPOSE_WEEK_PLAN_TOOL_NAME).toBe('propose_week_plan');
    expect(PROPOSE_WEEK_PLAN_TOOL.name).toBe('propose_week_plan');
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
      { id: 'm0', role: 'coach_ai', content: 'Welcome.', seq: 0, citations: [], createdAt: new Date() },
      { id: 'm1', role: 'athlete', content: 'In rhythm.', seq: 1, citations: [], createdAt: new Date() },
    ];
    expect(toWeeklyApiMessages(transcript)).toEqual([
      { role: 'user', content: WEEKLY_OPENER },
      { role: 'assistant', content: 'Welcome.' },
      { role: 'user', content: 'In rhythm.' },
    ]);
  });
});

describe('validateProposedPlan — days the athlete ruled out', () => {
  // 2026-07-29 is a Wednesday; its week runs Mon 2026-07-27 - Sun 2026-08-02.
  const TODAY = '2026-07-29';

  function proposal(...dates: string[]) {
    return {
      sessions: dates.map((date) => ({
        date,
        type: 'Endurance',
        durationMinutes: 60,
        zone: 'Z2',
        note: null,
      })),
    };
  }

  /**
   * The window bounds which weeks; until 2026-09-09 nothing bounded which days
   * inside them. `planningWindow` consumed the Fixed Constraints and Unavailable
   * Dates to pick a range and then dropped them, so a proposal on a day the
   * athlete had marked off validated and was written — the `NO TRAINING ON:`
   * prompt line was the only thing standing in the way, and `showable-version/11`
   * is the ticket that established a prompt line is a request, not a bound.
   * Found by CodeRabbit on PR #57.
   */
  it('drops a session on an Unavailable Date inside the window', () => {
    const window = planningWindow(TODAY, [], ['2026-07-31']);

    const result = validateProposedPlan(proposal('2026-07-30', '2026-07-31'), window);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sessions.map((s) => s.date)).toEqual(['2026-07-30']);
  });

  it('drops a session on a Fixed Constraint weekday', () => {
    // Friday is off every week; 2026-07-31 is the Friday of this window.
    const window = planningWindow(TODAY, ['Friday']);

    const result = validateProposedPlan(proposal('2026-07-30', '2026-07-31'), window);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sessions.map((s) => s.date)).toEqual(['2026-07-30']);
  });

  it('refuses the whole proposal when every day it named was ruled out', () => {
    // Nothing survives, so this is `empty` — the same refusal as a proposal of
    // rows that were all malformed. Nothing is staged either way.
    const window = planningWindow(TODAY, [], ['2026-07-30']);

    expect(validateProposedPlan(proposal('2026-07-30'), window)).toEqual({
      ok: false,
      reason: 'empty',
    });
  });
});

describe('validateProposedPlan', () => {
  // 2026-07-29 is a Wednesday; its week runs Mon 2026-07-27 - Sun 2026-08-02.
  const TODAY = '2026-07-29';
  const WINDOW = planningWindow(TODAY);

  it('accepts a well-formed proposal inside the window', () => {
    const result = validateProposedPlan(
      {
        sessions: [
          { date: '2026-07-29', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy' },
          { date: '2026-08-01', type: 'Intensity', durationMinutes: 45, zone: 'Z4', note: '' },
        ],
      },
      WINDOW,
    );
    expect(result).toEqual({
      ok: true,
      sessions: [
        { date: '2026-07-29', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy' },
        // An empty note normalises to null.
        { date: '2026-08-01', type: 'Intensity', durationMinutes: 45, zone: 'Z4', note: null },
      ],
    });
  });

  // Was 'accepts a well-formed proposal spanning two calendar weeks' until
  // showable-version/11. The window is the remainder of THIS week, so a second
  // week is no longer the Coach's to write - and this is the bound the ticket
  // exists for, because the prompt could only ever ask.
  it('drops a session beyond the end of the window', () => {
    const result = validateProposedPlan(
      {
        sessions: [
          { date: '2026-08-02', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
          { date: '2026-08-05', type: 'Intensity', durationMinutes: 45, zone: 'Z4', note: null },
        ],
      },
      WINDOW,
    );
    expect(result).toEqual({
      ok: true,
      sessions: [
        { date: '2026-08-02', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
      ],
    });
  });

  it('is empty when every session lies outside the window', () => {
    expect(
      validateProposedPlan(
        {
          sessions: [
            { date: '2026-08-05', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
          ],
        },
        WINDOW,
      ),
    ).toEqual({ ok: false, reason: 'empty' });
  });

  // On a fall-through the window starts NEXT Monday, so today is before it.
  it('drops a session dated today when the window fell through to next week', () => {
    const fellThrough = planningWindow(TODAY, [
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(fellThrough.fellThrough).toBe(true);
    expect(
      validateProposedPlan(
        {
          sessions: [
            { date: TODAY, type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
          ],
        },
        fellThrough,
      ),
    ).toEqual({ ok: false, reason: 'empty' });
  });

  it('is malformed when there is no sessions array', () => {
    expect(validateProposedPlan(null, WINDOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(validateProposedPlan({ sessions: 'nope' }, WINDOW)).toEqual({
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
      WINDOW,
    );
    expect(result).toEqual({
      ok: true,
      sessions: [{ date: '2026-07-31', type: 'Tempo', durationMinutes: 50, zone: 'Z3', note: 'ok' }],
    });
  });

  it('is empty when nothing valid survives', () => {
    const result = validateProposedPlan(
      { sessions: [{ date: '2020-01-01', type: 'Endurance', durationMinutes: 60, zone: '', note: '' }] },
      WINDOW,
    );
    expect(result).toEqual({ ok: false, reason: 'empty' });
  });

  // The untrusted-input edges of the proposal parser. `strict` tool use makes
  // these unlikely rather than impossible, and the parser is the server-authority
  // gate (ADR 0003) - so what it refuses is asserted, not assumed.
  it('is malformed when the input is not an object at all', () => {
    expect(validateProposedPlan(7, WINDOW)).toEqual({ ok: false, reason: 'malformed' });
    expect(validateProposedPlan('sessions', WINDOW)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('drops an entry that is not an object, and one whose date is not a string', () => {
    const result = validateProposedPlan(
      {
        sessions: [
          'Endurance on Thursday',
          null,
          { date: 20260731, type: 'Tempo', durationMinutes: 50, zone: 'Z3', note: null },
          { date: '2026-07-31', type: 'Tempo', durationMinutes: 50, zone: 'Z3', note: 'ok' },
        ],
      },
      WINDOW,
    );
    expect(result).toEqual({
      ok: true,
      sessions: [{ date: '2026-07-31', type: 'Tempo', durationMinutes: 50, zone: 'Z3', note: 'ok' }],
    });
  });

  // Lexically inside the window, but not a day that exists. Without the calendar
  // check the range compare alone would let it through, and a session dated
  // 2026-07-32 would be written.
  it('drops an impossible date that sorts inside the window', () => {
    expect(
      validateProposedPlan(
        {
          sessions: [
            { date: '2026-07-32', type: 'Tempo', durationMinutes: 50, zone: 'Z3', note: null },
          ],
        },
        WINDOW,
      ),
    ).toEqual({ ok: false, reason: 'empty' });
  });

  it('accepts both ends of the window inclusively', () => {
    const result = validateProposedPlan(
      {
        sessions: [
          { date: WINDOW.start, type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
          { date: WINDOW.end, type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null },
        ],
      },
      WINDOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessions.map((x) => x.date)).toEqual([WINDOW.start, WINDOW.end]);
    }
  });

  // The duration and text fields are the last untrusted values on the path, and
  // both normalise to null rather than to a plausible-looking substitute: a
  // session with no duration says so, where a defaulted 60 would be a number
  // nobody chose sitting in the athlete's week.
  it('keeps a duration at the ceiling and rejects one past it, or fractional', () => {
    const result = validateProposedPlan(
      {
        sessions: [
          { date: '2026-07-29', type: 'Endurance', durationMinutes: 1440, zone: 'Z2', note: null },
          { date: '2026-07-30', type: 'Endurance', durationMinutes: 1441, zone: 'Z2', note: null },
          { date: '2026-07-31', type: 'Endurance', durationMinutes: 60.5, zone: 'Z2', note: null },
          { date: '2026-08-01', type: 'Endurance', durationMinutes: -30, zone: 'Z2', note: null },
        ],
      },
      WINDOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessions.map((x) => x.durationMinutes)).toEqual([1440, null, null, null]);
    }
  });

  it('normalises a blank or whitespace-only zone and note to null', () => {
    const result = validateProposedPlan(
      {
        sessions: [
          { date: '2026-07-29', type: 'Endurance', durationMinutes: 60, zone: '   ', note: '	' },
        ],
      },
      WINDOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sessions[0]).toMatchObject({ zone: null, note: null });
    }
  });

  it('rejects a non-positive or absurd duration to null', () => {
    const result = validateProposedPlan(
      {
        sessions: [
          { date: '2026-07-29', type: 'Endurance', durationMinutes: 0, zone: 'Z2', note: '' },
          { date: '2026-07-30', type: 'Endurance', durationMinutes: 100000, zone: 'Z2', note: '' },
        ],
      },
      WINDOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sessions.map((s) => s.durationMinutes)).toEqual([null, null]);
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
    const checkIn = buildWeeklyCheckIn(athlete(), TODAY_KEY, null, 1);

    expect(checkIn.readiness).toBeUndefined();
    // Absent, not present-and-undefined: an explicit `readiness: undefined`
    // would still be a key something could reach into and render.
    expect('readiness' in checkIn).toBe(false);
  });

  it('keeps the facts that are real', () => {
    const checkIn = buildWeeklyCheckIn(athlete(), TODAY_KEY, null, 3, undefined, [], TARGET_RACE);

    expect(checkIn.phase).toBe('Block 1 of 5');
    expect(checkIn.experienceLevel).toBe('intermediate');
    expect(checkIn.sessionCount).toBe(2);
  });

  it('carries the whole report when a real Check-in supplied one', () => {
    // All five together, because a Check-in is one report. There is deliberately
    // no test for a partial readiness: `Readiness` requires all five, so a
    // half-filled one does not compile — which is the point of nesting it rather
    // than hanging five optional fields off CheckIn.
    const checkIn = buildWeeklyCheckIn(athlete(), TODAY_KEY, READINESS, 1);

    expect(checkIn.readiness).toEqual(READINESS);
  });
});
