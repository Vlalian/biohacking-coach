// @vitest-environment jsdom
// Story-level tests through the orchestrator's public API. The rule matrix
// itself lives in rules.test.mjs — no re-testing of matrix cells here.
import { describe, it, expect, beforeEach } from 'vitest';
import { applyMove } from '../public/js/moves.js';
import {
  createSession, getSession, updateSession, sessionsForDay,
  getMoveLog, getDateKey, weekStartOf, addDays,
} from '../public/js/store.js';

beforeEach(() => localStorage.clear());

// Next week is never frozen and all its days are valid targets — date-safe
// whatever day the suite runs on.
const todayKey   = getDateKey(new Date());
const nextMon    = addDays(weekStartOf(todayKey), 7);
const nextTue    = addDays(nextMon, 1);
const nextWed    = addDays(nextMon, 2);
const weekAfter  = addDays(nextMon, 7);
const lastMonday = addDays(weekStartOf(todayKey), -7);

describe('applyMove — stories', () => {
  it('revival move: a skipped session dragged to a new day becomes planned there', () => {
    const s = createSession({ dateKey: nextMon, type: 'Endurance', origin: 'coach' });
    updateSession(s.id, { status: 'skipped' });
    expect(applyMove(s.id, nextWed)).toBe('move');
    expect(getSession(s.id)).toMatchObject({ dateKey: nextWed, status: 'planned', parked: false });
  });

  it('Double formation: training moved onto a training day — both keep their identity and rating', () => {
    const resident = createSession({ dateKey: nextWed, type: 'Intensity', origin: 'coach' });
    updateSession(resident.id, { status: 'completed', feedback: { body: 9, mind: 7, comment: 'brutal' } });
    const mover = createSession({ dateKey: nextMon, type: 'Recovery', origin: 'coach' });
    expect(applyMove(mover.id, nextWed)).toBe('move');
    const day = sessionsForDay(nextWed);
    expect(day).toHaveLength(2);
    expect(day.map(s => s.dayOrder)).toEqual([1, 2]);
    expect(getSession(resident.id).feedback).toMatchObject({ body: 9 });
    expect(getSession(mover.id).status).toBe('planned');
  });

  it('bounce: a drop toward another week changes nothing and logs nothing', () => {
    const s = createSession({ dateKey: nextMon, type: 'Endurance', origin: 'coach' });
    expect(applyMove(s.id, weekAfter)).toBe('bounce');
    expect(getSession(s.id).dateKey).toBe(nextMon);
    expect(getMoveLog()).toHaveLength(0);
  });

  it('bounce: a drop on a past day changes nothing', () => {
    const s = createSession({ dateKey: nextMon, type: 'Endurance', origin: 'coach' });
    expect(applyMove(s.id, lastMonday)).toBe('bounce');
    expect(getSession(s.id).dateKey).toBe(nextMon);
  });

  it('frozen: a completed session cannot be lifted', () => {
    const s = createSession({ dateKey: nextMon, type: 'Endurance', origin: 'coach' });
    updateSession(s.id, { status: 'completed', feedback: { body: 5, mind: 5, comment: '' } });
    expect(applyMove(s.id, nextWed)).toBe('frozen');
    expect(getSession(s.id).dateKey).toBe(nextMon);
  });

  it('every applied move lands in the silent log as session, from-day, to-day', () => {
    const s = createSession({ dateKey: nextMon, type: 'Tempo', origin: 'coach' });
    applyMove(s.id, nextTue);
    applyMove(s.id, nextWed);
    expect(getMoveLog()).toEqual([
      { sessionId: s.id, sessionType: 'Tempo', from: nextMon, to: nextTue },
      { sessionId: s.id, sessionType: 'Tempo', from: nextTue, to: nextWed },
    ]);
  });
});
