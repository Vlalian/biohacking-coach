import { describe, it, expect } from 'vitest';
import {
  athleteMetrics,
  EXTENDED_WEEKLY_SESSION_TURNS,
  type MetricsInput,
} from './metrics';

const input = (over: Partial<MetricsInput> = {}): MetricsInput => ({
  athleteId: 'a1',
  sessions: [],
  chatTurnWeeks: [],
  weeklySessionTurnsByWeek: {},
  activityDays: [],
  moveEventDates: [],
  ...over,
});

describe('Coach Engagement Rate', () => {
  it('counts a week where the athlete sent a Coach Chat turn', () => {
    const m = athleteMetrics(
      input({
        sessions: [{ date: '2026-08-17', status: 'completed', rated: true }],
        chatTurnWeeks: ['2026-08-17'],
      }),
    );

    expect(m.coachEngagement).toEqual({ engagedWeeks: 1, activeWeeks: 1, rate: 1 });
  });

  it('does NOT count a week whose only Coach contact was the Weekly Session', () => {
    // The glossary word is "beyond": holding the weekly ritual is compliance,
    // not engagement. This is the clause that makes the metric mean anything,
    // and the easiest one to get wrong.
    const m = athleteMetrics(
      input({
        sessions: [{ date: '2026-08-17', status: 'completed', rated: true }],
        weeklySessionTurnsByWeek: { '2026-08-17': 2 },
      }),
    );

    expect(m.coachEngagement.engagedWeeks).toBe(0);
    expect(m.coachEngagement.rate).toBe(0);
  });

  it('counts an *extended* Weekly Session — more athlete turns than closing the plan needs', () => {
    const m = athleteMetrics(
      input({
        sessions: [{ date: '2026-08-17', status: 'completed', rated: true }],
        weeklySessionTurnsByWeek: {
          '2026-08-17': EXTENDED_WEEKLY_SESSION_TURNS,
        },
      }),
    );

    expect(m.coachEngagement.engagedWeeks).toBe(1);
  });

  it('ignores weeks with no training at all — the denominator is *active* weeks', () => {
    const m = athleteMetrics(
      input({
        sessions: [{ date: '2026-08-17', status: 'completed', rated: false }],
        // A chat turn in a week the athlete did not train counts for nothing:
        // the ratio is over active training weeks.
        chatTurnWeeks: ['2026-08-17', '2026-09-07'],
      }),
    );

    expect(m.coachEngagement.activeWeeks).toBe(1);
    expect(m.coachEngagement.engagedWeeks).toBe(1);
  });

  it('is null rather than zero for an athlete with no active weeks', () => {
    // Zero would read as "engaged in none of their weeks", which is a finding.
    // No weeks is the absence of a finding, and the report must not confuse them.
    expect(athleteMetrics(input()).coachEngagement.rate).toBeNull();
  });
});

describe('Retention past day 10', () => {
  it('is true when first and last activity span more than ten days', () => {
    const m = athleteMetrics(
      input({ activityDays: ['2026-08-01', '2026-08-05', '2026-08-14'] }),
    );

    expect(m.retention).toMatchObject({ spanDays: 13, pastDay10: true });
  });

  it('is false inside the habit-formation window', () => {
    const m = athleteMetrics(input({ activityDays: ['2026-08-01', '2026-08-06'] }));
    expect(m.retention).toMatchObject({ spanDays: 5, pastDay10: false });
  });

  it('is false, not an error, for an athlete who never did anything', () => {
    expect(athleteMetrics(input()).retention).toMatchObject({
      spanDays: 0,
      pastDay10: false,
    });
  });
});

describe('Session Reflection completion rate', () => {
  it('is rated over completed — planned sessions are not owed a rating', () => {
    const m = athleteMetrics(
      input({
        sessions: [
          { date: '2026-08-17', status: 'completed', rated: true },
          { date: '2026-08-18', status: 'completed', rated: false },
          { date: '2026-08-19', status: 'planned', rated: false },
        ],
      }),
    );

    expect(m.reflectionCompletion).toEqual({ rated: 1, completed: 2, rate: 0.5 });
  });

  it('does not divide by zero for an athlete with nothing completed', () => {
    const m = athleteMetrics(
      input({ sessions: [{ date: '2026-08-19', status: 'planned', rated: false }] }),
    );
    expect(m.reflectionCompletion.rate).toBeNull();
  });
});

describe('Skip rate and Session Moves', () => {
  it('measures skips against the sessions that were meant to happen', () => {
    const m = athleteMetrics(
      input({
        sessions: [
          { date: '2026-08-17', status: 'completed', rated: true },
          { date: '2026-08-18', status: 'skipped', rated: false },
          { date: '2026-08-19', status: 'skipped', rated: false },
        ],
      }),
    );

    expect(m.skips).toEqual({ skipped: 2, decided: 3, rate: 2 / 3 });
  });

  it('averages Session Moves over the athlete\'s active weeks', () => {
    const m = athleteMetrics(
      input({
        sessions: [
          { date: '2026-08-17', status: 'completed', rated: true },
          { date: '2026-08-24', status: 'completed', rated: true },
        ],
        moveEventDates: ['2026-08-18', '2026-08-19', '2026-08-25'],
      }),
    );

    expect(m.movesPerWeek).toBe(1.5);
  });
});

describe('what a metrics row carries', () => {
  it('identifies the athlete by opaque id and by nothing else', () => {
    // The script prints these. A name or an email in a metrics row would put
    // identity in a place identity is deliberately kept out of (ADR 0006).
    const m = athleteMetrics(input());
    expect(m.athleteId).toBe('a1');
    expect(Object.keys(m)).toEqual([
      'athleteId',
      'coachEngagement',
      'retention',
      'reflectionCompletion',
      'skips',
      'movesPerWeek',
    ]);
  });
});
