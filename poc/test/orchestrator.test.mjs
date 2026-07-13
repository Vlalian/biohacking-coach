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

describe('applyMove — Displacement stories', () => {
  it('park → Rest leaves → auto-restore, in one flow', () => {
    const training = createSession({ dateKey: nextWed, type: 'Endurance', origin: 'coach' });
    const rest     = createSession({ dateKey: nextMon, type: 'Rest', origin: 'coach' });

    expect(applyMove(rest.id, nextWed)).toBe('move');
    expect(getSession(training.id)).toMatchObject({ status: 'unavailable', parked: true, dateKey: nextWed });
    expect(getSession(rest.id)).toMatchObject({ dateKey: nextWed, status: 'planned' });

    const friday = addDays(nextMon, 4);
    expect(applyMove(rest.id, friday)).toBe('move');
    expect(getSession(training.id)).toMatchObject({ status: 'planned', parked: false, dateKey: nextWed });
  });

  it('training dropped on a Rest day lands parked; the Rest is untouched', () => {
    const rest     = createSession({ dateKey: nextWed, type: 'Rest', origin: 'coach' });
    const training = createSession({ dateKey: nextMon, type: 'Tempo', origin: 'coach' });
    expect(applyMove(training.id, nextWed)).toBe('move');
    expect(getSession(training.id)).toMatchObject({ dateKey: nextWed, status: 'unavailable', parked: true });
    expect(getSession(rest.id)).toMatchObject({ dateKey: nextWed, status: 'planned', parked: false });
  });

  it('moving a parked session to a free day revives it to planned', () => {
    const rest     = createSession({ dateKey: nextWed, type: 'Rest', origin: 'coach' });
    const training = createSession({ dateKey: nextMon, type: 'Tempo', origin: 'coach' });
    applyMove(training.id, nextWed); // parks
    expect(applyMove(training.id, nextTue)).toBe('move');
    expect(getSession(training.id)).toMatchObject({ dateKey: nextTue, status: 'planned', parked: false });
  });

  it('Rest onto Rest bounces: nothing changes, nothing is logged', () => {
    const restA = createSession({ dateKey: nextMon, type: 'Rest', origin: 'coach' });
    const restB = createSession({ dateKey: nextWed, type: 'Rest', origin: 'coach' });
    expect(applyMove(restA.id, nextWed)).toBe('bounce');
    expect(getSession(restA.id).dateKey).toBe(nextMon);
    expect(getSession(restB.id).dateKey).toBe(nextWed);
    expect(getMoveLog()).toHaveLength(0);
  });
});

describe('Athlete Sessions — create, edit, delete, retro-log', () => {
  it('creates a planned Athlete Session on a future day and logs it silently', async () => {
    const { createAthleteSession } = await import('../public/js/moves.js');
    const { getCreationLog } = await import('../public/js/store.js');
    const s = createAthleteSession({ dateKey: nextTue, type: 'Strength', duration: '30 min', note: 'Hips.' });
    expect(s).toMatchObject({ origin: 'athlete', type: 'Strength', status: 'planned', isTraining: true, dateKey: nextTue });
    expect(getCreationLog()).toEqual([{ sessionId: s.id, sessionType: 'Strength', dateKey: nextTue, retro: false }]);
  });

  it('Mobility is fixed not-training; Other takes its toggle', async () => {
    const { createAthleteSession } = await import('../public/js/moves.js');
    const mob   = createAthleteSession({ dateKey: nextTue, type: 'Mobility' });
    const other = createAthleteSession({ dateKey: nextWed, type: 'Other', isTraining: false });
    expect(mob.isTraining).toBe(false);
    expect(other.isTraining).toBe(false);
  });

  it('retro-log on a past day creates the session as already completed', async () => {
    const { createAthleteSession } = await import('../public/js/moves.js');
    const { getCreationLog } = await import('../public/js/store.js');
    const pastDay = addDays(lastMonday, 2);
    const s = createAthleteSession({ dateKey: pastDay, type: 'Strength' });
    expect(s.status).toBe('completed');
    expect(getCreationLog()[0].retro).toBe(true);
  });

  it('edits and deletes an Athlete Session', async () => {
    const { createAthleteSession, editAthleteSession, deleteAthleteSession } = await import('../public/js/moves.js');
    const s = createAthleteSession({ dateKey: nextTue, type: 'Other', isTraining: true, title: 'Yoga' });
    editAthleteSession(s.id, { title: 'Hot yoga', duration: '45 min' });
    expect(getSession(s.id)).toMatchObject({ title: 'Hot yoga', duration: '45 min' });
    deleteAthleteSession(s.id);
    expect(getSession(s.id)).toBeNull();
  });

  it('a training-typed Athlete Session parks when dropped on a Rest day', async () => {
    const { createAthleteSession } = await import('../public/js/moves.js');
    createSession({ dateKey: nextWed, type: 'Rest', origin: 'coach' });
    const s = createAthleteSession({ dateKey: nextMon, type: 'Strength' });
    expect(applyMove(s.id, nextWed)).toBe('move');
    expect(getSession(s.id)).toMatchObject({ status: 'unavailable', parked: true });
  });

  it('a non-load Athlete Session coexists with Rest', async () => {
    const { createAthleteSession } = await import('../public/js/moves.js');
    createSession({ dateKey: nextWed, type: 'Rest', origin: 'coach' });
    const s = createAthleteSession({ dateKey: nextMon, type: 'Mobility' });
    expect(applyMove(s.id, nextWed)).toBe('move');
    expect(getSession(s.id)).toMatchObject({ status: 'planned', parked: false });
  });
});
