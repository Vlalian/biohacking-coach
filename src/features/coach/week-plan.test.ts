import { describe, it, expect } from 'vitest';
import type { Session } from '@/features/session/session';
import { weekPlanFrom } from './week-plan';

function session(over: Partial<Session> = {}): Session {
  return {
    id: 'sess_1',
    date: '2026-08-17',
    type: 'Endurance',
    status: 'planned',
    parked: false,
    dayOrder: 0,
    title: null,
    duration: 90,
    zone: '2',
    note: null,
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    origin: 'coach',
    isTraining: true,
    ...over,
  };
}

describe('weekPlanFrom', () => {
  it('carries status and authorship through', () => {
    const [entry] = weekPlanFrom([
      session({ status: 'completed', origin: 'head_coach' }),
    ]);
    expect(entry.status).toBe('completed');
    expect(entry.origin).toBe('head_coach');
  });

  // The whole point of this module: what it returns is what reaches a prompt,
  // and a prompt that contains an id is one a model can recite back.
  it('carries no entity id', () => {
    const entries = weekPlanFrom([session({ id: 'sess_secret' })]);
    expect(JSON.stringify(entries)).not.toContain('sess_secret');
    expect(entries[0]).not.toHaveProperty('id');
  });

  it('is empty for a week with no sessions', () => {
    expect(weekPlanFrom([])).toEqual([]);
  });

  describe('the same-type Double qualifier', () => {
    // CONTEXT.md (Week Activity): a position qualifier ONLY for same-type
    // Doubles — because that is the single case where a day and a type do not
    // identify a session between two humans.
    it('numbers two same-type sessions on one day, in calendar order', () => {
      const entries = weekPlanFrom([
        session({ id: 'a', date: '2026-08-17', type: 'Endurance', dayOrder: 0 }),
        session({ id: 'b', date: '2026-08-17', type: 'Endurance', dayOrder: 1 }),
      ]);
      expect(entries.map((e) => e.position)).toEqual([1, 2]);
    });

    it('leaves a Double of two different types unqualified', () => {
      const entries = weekPlanFrom([
        session({ id: 'a', date: '2026-08-17', type: 'Endurance' }),
        session({ id: 'b', date: '2026-08-17', type: 'Intensity' }),
      ]);
      expect(entries.every((e) => e.position === undefined)).toBe(true);
    });

    it('leaves same-type sessions on different days unqualified', () => {
      const entries = weekPlanFrom([
        session({ id: 'a', date: '2026-08-17', type: 'Endurance' }),
        session({ id: 'b', date: '2026-08-18', type: 'Endurance' }),
      ]);
      expect(entries.every((e) => e.position === undefined)).toBe(true);
    });
  });

  describe('the Reference', () => {
    it('marks the session the athlete tapped', () => {
      const entries = weekPlanFrom(
        [session({ id: 'a' }), session({ id: 'b', date: '2026-08-18' })],
        'b',
      );
      expect(entries.map((e) => e.isReference)).toEqual([undefined, true]);
    });

    it('marks nothing when the Reference is outside this week', () => {
      const entries = weekPlanFrom([session({ id: 'a' })], 'not_this_week');
      expect(entries.every((e) => e.isReference === undefined)).toBe(true);
    });

    it('marks nothing when there is no Reference', () => {
      const entries = weekPlanFrom([session({ id: 'a' })], null);
      expect(entries.every((e) => e.isReference === undefined)).toBe(true);
    });
  });
});
