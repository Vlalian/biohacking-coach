// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initStore, getMigrationReport, dismissMigrationReport,
  createSession, getSession, updateSession, deleteSession,
  allSessions, sessionsForDay, sessionsForWeek,
  agreeWeeklyPlan, rateDay, markDateUnavailable,
  getUnavailableDates, getSkippedSessions, getLastWeekFeedback,
  getDateKey, weekStartOf, addDays,
} from '../public/js/store.js';

beforeEach(() => {
  localStorage.clear();
});

// ── Date helpers used throughout ──────────────────────────────────────────────
const todayKey     = getDateKey(new Date());
const thisMonday   = weekStartOf(todayKey);
const nextMonday   = addDays(thisMonday, 7);
const lastMonday   = addDays(thisMonday, -7);

describe('date helpers', () => {
  it('weekStartOf returns a Monday', () => {
    const monday = new Date(weekStartOf(todayKey) + 'T00:00:00');
    expect(monday.getDay()).toBe(1);
  });

  it('weekStartOf of a Monday is itself', () => {
    expect(weekStartOf(thisMonday)).toBe(thisMonday);
  });

  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });
});

describe('create / query round-trips', () => {
  it('createSession mints an id and returns the entity', () => {
    const s = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    expect(s.id).toBeTruthy();
    expect(getSession(s.id)).toEqual(s);
  });

  it('first session on a day gets dayOrder 1, second gets 2', () => {
    const a = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    const b = createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    expect(a.dayOrder).toBe(1);
    expect(b.dayOrder).toBe(2);
  });

  it('sessionsForDay returns sessions sorted by dayOrder', () => {
    createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    const day = sessionsForDay(todayKey);
    expect(day.map(s => s.type)).toEqual(['Endurance', 'Recovery']);
  });

  it('sessionsForWeek spans Monday to Sunday only', () => {
    createSession({ dateKey: thisMonday, type: 'Endurance', origin: 'coach' });
    createSession({ dateKey: addDays(thisMonday, 6), type: 'Recovery', origin: 'coach' });
    createSession({ dateKey: nextMonday, type: 'Tempo', origin: 'coach' });
    const week = sessionsForWeek(thisMonday);
    expect(week.map(s => s.type).sort()).toEqual(['Endurance', 'Recovery']);
  });

  it('a session defaults to planned, unparked, with no feedback', () => {
    const s = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    expect(s.status).toBe('planned');
    expect(s.parked).toBe(false);
    expect(s.feedback).toBeNull();
  });

  it('Rest is not training; coach training types are', () => {
    const rest = createSession({ dateKey: todayKey, type: 'Rest', origin: 'coach' });
    const end  = createSession({ dateKey: addDays(todayKey, 1), type: 'Endurance', origin: 'coach' });
    expect(rest.isTraining).toBe(false);
    expect(end.isTraining).toBe(true);
  });

  it('updateSession patches and persists', () => {
    const s = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    updateSession(s.id, { status: 'skipped' });
    expect(getSession(s.id).status).toBe('skipped');
  });

  it('deleteSession removes the entity', () => {
    const s = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    deleteSession(s.id);
    expect(getSession(s.id)).toBeNull();
    expect(allSessions()).toHaveLength(0);
  });
});

// ── Migration fixtures ────────────────────────────────────────────────────────

function seedLegacyState({ weekPlan = true, history = true, feedback = {} } = {}) {
  if (weekPlan) {
    localStorage.setItem('bh_week_plan', JSON.stringify({
      weekStart: thisMonday,
      sessions: [
        { dayOfWeek: 'Monday',    type: 'Endurance', duration: '90 min', zone: 'Zone 2', note: 'Aerobic base.' },
        { dayOfWeek: 'Tuesday',   type: 'Rest',      duration: null,     zone: null,     note: null },
        { dayOfWeek: 'Wednesday', type: 'Tempo',     duration: '75 min', zone: 'Zone 3', note: 'Comfortably hard.' },
      ],
    }));
  }
  if (history) {
    localStorage.setItem('bh_plan_history', JSON.stringify([
      { dateKey: lastMonday, type: 'Endurance', duration: '60 min', zone: 'Zone 2', note: 'Last week.' },
      { dateKey: addDays(lastMonday, 2), type: 'Recovery', duration: '45 min', zone: 'Zone 1', note: 'Flush.' },
    ]));
  }
  localStorage.setItem('bh_session_feedback', JSON.stringify(feedback));
}

describe('migration — preservation', () => {
  it('agreed week plan sessions become entities, Rest included', () => {
    seedLegacyState();
    initStore();
    expect(sessionsForDay(thisMonday)[0].type).toBe('Endurance');
    expect(sessionsForDay(addDays(thisMonday, 1))[0].type).toBe('Rest');
    expect(sessionsForDay(addDays(thisMonday, 2))[0].type).toBe('Tempo');
  });

  it('plan history becomes planned entities', () => {
    seedLegacyState();
    initStore();
    expect(sessionsForDay(lastMonday)[0]).toMatchObject({ type: 'Endurance', status: 'planned', origin: 'coach' });
  });

  it('a rating maps to completed with embedded feedback', () => {
    seedLegacyState({ feedback: { [lastMonday]: { body: 6, mind: 7, comment: 'good', sessionType: 'Endurance' } } });
    initStore();
    const s = sessionsForDay(lastMonday)[0];
    expect(s.status).toBe('completed');
    expect(s.feedback).toMatchObject({ body: 6, mind: 7, comment: 'good' });
  });

  it('skipped marker maps to skipped status', () => {
    seedLegacyState({ feedback: { [thisMonday]: { skipped: true, sessionType: 'Endurance' } } });
    initStore();
    expect(sessionsForDay(thisMonday)[0].status).toBe('skipped');
  });

  it('unavailable marker on a plan day maps to unavailable status', () => {
    seedLegacyState({ feedback: { [addDays(thisMonday, 2)]: { unavailable: true, sessionType: 'Tempo' } } });
    initStore();
    expect(sessionsForDay(addDays(thisMonday, 2))[0].status).toBe('unavailable');
  });

  it('template-era feedback (rating on a day with no plan record) mints a completed entity', () => {
    const orphanDay = addDays(lastMonday, 4);
    seedLegacyState({ feedback: { [orphanDay]: { body: 5, mind: 5, comment: '', sessionType: 'Recovery' } } });
    initStore();
    const s = sessionsForDay(orphanDay)[0];
    expect(s).toMatchObject({ type: 'Recovery', status: 'completed' });
    expect(s.feedback).toMatchObject({ body: 5, mind: 5 });
  });

  it('unavailable marker without a session becomes an unavailable date', () => {
    const freeDay = addDays(todayKey, 3);
    seedLegacyState({ weekPlan: false, feedback: { [freeDay]: { unavailable: true } } });
    initStore();
    expect(getUnavailableDates()).toContain(freeDay);
    expect(sessionsForDay(freeDay)).toHaveLength(0);
  });

  it('single-session days get dayOrder 1', () => {
    seedLegacyState();
    initStore();
    expect(sessionsForDay(thisMonday)[0].dayOrder).toBe(1);
  });
});

describe('migration — idempotence and non-destructiveness', () => {
  it('running migration twice changes nothing', () => {
    seedLegacyState({ feedback: { [lastMonday]: { body: 6, mind: 7, comment: '', sessionType: 'Endurance' } } });
    initStore();
    const first = allSessions();
    const secondReport = initStore();
    expect(secondReport).toBeNull();
    expect(allSessions()).toEqual(first);
  });

  it('old localStorage keys are never modified', () => {
    seedLegacyState({ feedback: { [lastMonday]: { body: 6, mind: 7, comment: '', sessionType: 'Endurance' } } });
    const before = {
      plan:     localStorage.getItem('bh_week_plan'),
      history:  localStorage.getItem('bh_plan_history'),
      feedback: localStorage.getItem('bh_session_feedback'),
    };
    initStore();
    expect(localStorage.getItem('bh_week_plan')).toBe(before.plan);
    expect(localStorage.getItem('bh_plan_history')).toBe(before.history);
    expect(localStorage.getItem('bh_session_feedback')).toBe(before.feedback);
  });
});

describe('migration — eager horizon seeding', () => {
  it('future horizon weeks hold stored planned sessions when a week plan exists', () => {
    seedLegacyState();
    localStorage.setItem('bca_phase', 'Base Building');
    initStore();
    for (let w = 1; w <= 4; w++) {
      const week = sessionsForWeek(addDays(thisMonday, 7 * w));
      expect(week.length).toBeGreaterThan(0);
      expect(week.every(s => s.status === 'planned' && s.origin === 'coach')).toBe(true);
    }
  });

  it('a seeded two-session day round-trips with dayOrder 1 and 2', () => {
    seedLegacyState();
    localStorage.setItem('bca_phase', 'Base Building');
    initStore();
    const week = sessionsForWeek(nextMonday);
    const byDay = {};
    week.forEach(s => { (byDay[s.dateKey] = byDay[s.dateKey] || []).push(s); });
    const doubleDay = Object.values(byDay).find(d => d.length === 2);
    expect(doubleDay).toBeTruthy();
    expect(doubleDay.map(s => s.dayOrder).sort()).toEqual([1, 2]);
  });

  it('seeded weeks include Rest entities', () => {
    seedLegacyState();
    localStorage.setItem('bca_phase', 'Base Building');
    initStore();
    expect(sessionsForWeek(nextMonday).some(s => s.type === 'Rest')).toBe(true);
  });

  it('a fresh athlete (no week plan) gets nothing seeded', () => {
    seedLegacyState({ weekPlan: false, history: false });
    initStore();
    expect(allSessions()).toHaveLength(0);
  });
});

describe('migration report', () => {
  it('first run returns counts; they land in the pending report', () => {
    seedLegacyState({ feedback: {
      [lastMonday]: { body: 6, mind: 7, comment: '', sessionType: 'Endurance' },
      [addDays(lastMonday, 2)]: { skipped: true, sessionType: 'Recovery' },
    } });
    const report = initStore();
    expect(report.sessions).toBeGreaterThanOrEqual(5); // 3 plan + 2 history
    expect(report.ratings).toBe(1);
    expect(report.skips).toBe(1);
    expect(getMigrationReport()).toMatchObject({ ratings: 1, skips: 1, dismissed: false });
  });

  it('dismissing hides it; a re-run shows nothing', () => {
    seedLegacyState();
    initStore();
    dismissMigrationReport();
    expect(getMigrationReport().dismissed).toBe(true);
    expect(initStore()).toBeNull();
  });

  it('no migration report for a fresh athlete with no legacy state', () => {
    const report = initStore();
    expect(report).toBeNull();
    expect(getMigrationReport()).toBeNull();
  });
});

describe('agreeWeeklyPlan — write path redirect', () => {
  it('agreed sessions land in the store, Rest included', () => {
    initStore();
    agreeWeeklyPlan(thisMonday, [
      { dayOfWeek: 'Monday', type: 'Endurance', duration: '90 min', zone: 'Z2', note: 'Long one.' },
      { dayOfWeek: 'Tuesday', type: 'Rest', duration: null, zone: null, note: null },
    ]);
    expect(sessionsForDay(thisMonday)[0]).toMatchObject({ type: 'Endurance', origin: 'coach', status: 'planned' });
    expect(sessionsForDay(addDays(thisMonday, 1))[0].type).toBe('Rest');
  });

  it('replaces the week\'s provisional planned sessions but keeps completed ones', () => {
    initStore();
    const done = createSession({ dateKey: thisMonday, type: 'Tempo', origin: 'coach' });
    updateSession(done.id, { status: 'completed', feedback: { body: 5, mind: 5, comment: '' } });
    createSession({ dateKey: addDays(thisMonday, 2), type: 'Endurance', origin: 'coach' }); // provisional
    agreeWeeklyPlan(thisMonday, [
      { dayOfWeek: 'Friday', type: 'Recovery', duration: '45 min', zone: 'Z1', note: null },
    ]);
    expect(getSession(done.id)).not.toBeNull();
    expect(sessionsForDay(addDays(thisMonday, 2))).toHaveLength(0);
    expect(sessionsForDay(addDays(thisMonday, 4))[0].type).toBe('Recovery');
  });

  it('does not touch other weeks', () => {
    initStore();
    const nextWeekSession = createSession({ dateKey: nextMonday, type: 'Endurance', origin: 'coach' });
    agreeWeeklyPlan(thisMonday, [
      { dayOfWeek: 'Monday', type: 'Tempo', duration: null, zone: null, note: null },
    ]);
    expect(getSession(nextWeekSession.id)).not.toBeNull();
  });

  it('two sessions on the same day get dayOrder from array order', () => {
    initStore();
    agreeWeeklyPlan(thisMonday, [
      { dayOfWeek: 'Monday', type: 'Endurance', duration: '90 min', zone: 'Z2', note: null },
      { dayOfWeek: 'Monday', type: 'Recovery', duration: '30 min', zone: 'Z1', note: null },
    ]);
    const day = sessionsForDay(thisMonday);
    expect(day.map(s => [s.type, s.dayOrder])).toEqual([['Endurance', 1], ['Recovery', 2]]);
  });
});

describe('day-keyed adapters (single-session semantics)', () => {
  it('rateDay marks the day\'s session completed with feedback', () => {
    initStore();
    const s = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    rateDay(todayKey, 'Endurance', { body: 8, mind: 6, comment: 'hard' });
    expect(getSession(s.id)).toMatchObject({ status: 'completed', feedback: { body: 8, mind: 6, comment: 'hard' } });
  });

  it('rateDay on an empty day mints a completed entity (detected workout)', () => {
    initStore();
    rateDay(todayKey, 'Endurance', { body: 7, mind: 7, comment: '' });
    expect(sessionsForDay(todayKey)[0]).toMatchObject({ type: 'Endurance', status: 'completed' });
  });

  it('markDateUnavailable flips the day\'s session; empty day becomes an unavailable date', () => {
    initStore();
    const s = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    markDateUnavailable(todayKey);
    expect(getSession(s.id).status).toBe('unavailable');

    const freeDay = addDays(todayKey, 3);
    markDateUnavailable(freeDay);
    expect(getUnavailableDates()).toContain(freeDay);
  });

  it('getSkippedSessions returns last-7-day skips as {date, sessionType}', () => {
    initStore();
    const s = createSession({ dateKey: todayKey, type: 'Tempo', origin: 'coach' });
    updateSession(s.id, { status: 'skipped' });
    expect(getSkippedSessions()).toEqual([{ date: todayKey, sessionType: 'Tempo' }]);
  });

  it('getLastWeekFeedback returns rated entries oldest-first', () => {
    initStore();
    const yesterday = addDays(todayKey, -1);
    createSession({ dateKey: yesterday, type: 'Endurance', origin: 'coach' });
    createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    rateDay(yesterday, 'Endurance', { body: 6, mind: 6, comment: 'a' });
    rateDay(todayKey, 'Recovery', { body: 4, mind: 8, comment: 'b' });
    const fb = getLastWeekFeedback();
    expect(fb.map(e => e.comment)).toEqual(['a', 'b']);
    expect(fb[0]).toMatchObject({ dateKey: yesterday, sessionType: 'Endurance', body: 6, mind: 6 });
  });

  it('getUnavailableDates only returns today-or-later dates', () => {
    initStore();
    const past = addDays(todayKey, -2);
    const s = createSession({ dateKey: past, type: 'Endurance', origin: 'coach' });
    updateSession(s.id, { status: 'unavailable' });
    const t = createSession({ dateKey: todayKey, type: 'Tempo', origin: 'coach' });
    updateSession(t.id, { status: 'unavailable' });
    expect(getUnavailableDates()).toEqual([todayKey]);
  });
});

describe('getSkippedSessions — same-type Double position qualifier', () => {
  it('adds position when two same-type sessions share the day', () => {
    initStore();
    const first = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    updateSession(first.id, { status: 'skipped' });
    expect(getSkippedSessions()).toEqual([{ date: todayKey, sessionType: 'Endurance', position: 1 }]);
  });

  it('omits position for a different-type Double', () => {
    initStore();
    const first = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    updateSession(first.id, { status: 'skipped' });
    expect(getSkippedSessions()).toEqual([{ date: todayKey, sessionType: 'Endurance' }]);
  });
});

describe('getWeekActivity — current-week moves and creations for the Coach', () => {
  it('returns only current-week entries as natural-reference data', async () => {
    const { getWeekActivity, appendMoveLog, appendCreationLog } = await import('../public/js/store.js');
    initStore();
    const s = createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    appendMoveLog({ sessionId: s.id, sessionType: 'Recovery', from: thisMonday, to: todayKey });
    appendMoveLog({ sessionId: 'gone', sessionType: 'Tempo', from: lastMonday, to: lastMonday }); // past week
    appendCreationLog({ sessionId: s.id, sessionType: 'Strength', dateKey: todayKey, retro: false });
    appendCreationLog({ sessionId: 'x', sessionType: 'Mobility', dateKey: lastMonday, retro: true }); // past week
    const activity = getWeekActivity();
    expect(activity.moves).toEqual([{ sessionType: 'Recovery', from: thisMonday, to: todayKey }]);
    expect(activity.creations).toEqual([{ sessionType: 'Strength', dateKey: todayKey, retro: false }]);
  });

  it('adds the position qualifier when the moved session sits in a same-type Double', async () => {
    const { getWeekActivity, appendMoveLog } = await import('../public/js/store.js');
    initStore();
    createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    const s = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    appendMoveLog({ sessionId: s.id, sessionType: 'Endurance', from: thisMonday, to: todayKey });
    expect(getWeekActivity().moves[0].position).toBe(2);
  });
});
