// @vitest-environment jsdom
// Garmin import — parsed upload sessions become store entities (issue gs-02).

import { describe, it, expect, beforeEach } from 'vitest';
import { importParsedSessions, pickRatingCandidate, getStreams, streamKey } from '../public/js/garmin-import.js';
import { allSessions, createSession, sessionsForDay } from '../public/js/store.js';

beforeEach(() => {
  localStorage.clear();
});

function parsedRun(overrides = {}) {
  return {
    date: '2026-07-10',
    sessionType: 'Endurance',
    duration: 62,
    body: null,
    mind: null,
    note: 'Imported from Garmin · running',
    startTime: '2026-07-10T08:00:00.000Z',
    sport: 'running',
    summary: { avgHr: 132, maxHr: 161, avgSpeedMps: 3.1, distanceM: 11500, ascentM: 84, avgPowerW: null },
    streams: { t: [0, 10, 20], hr: [120, 131, 145] },
    ...overrides,
  };
}

describe('importParsedSessions', () => {
  it('creates a completed read-only entity with provenance and writes the stream key', () => {
    const { imported, skipped } = importParsedSessions([parsedRun()]);
    expect(skipped).toBe(0);
    expect(imported).toHaveLength(1);

    const e = imported[0];
    expect(e.dateKey).toBe('2026-07-10');
    expect(e.type).toBe('Endurance');
    expect(e.status).toBe('completed');
    expect(e.origin).toBe('garmin');       // not 'athlete' — never editable/deletable
    expect(e.duration).toBe('62 min');
    expect(e.source).toBe('garmin');
    expect(e.startTime).toBe('2026-07-10T08:00:00.000Z');
    expect(e.summary.avgHr).toBe(132);

    expect(getStreams(e.id)).toEqual({ t: [0, 10, 20], hr: [120, 131, 145] });
  });

  it('keeps the hot entity path clean: no stream arrays inside bh_sessions', () => {
    importParsedSessions([parsedRun()]);
    const raw = localStorage.getItem('bh_sessions');
    expect(raw).not.toContain('"streams"');
    expect(JSON.parse(raw)[0].streams).toBeUndefined();
  });

  it('writes no stream key when the workout has no streams', () => {
    const { imported } = importParsedSessions([parsedRun({ streams: { t: [] } })]);
    expect(localStorage.getItem(streamKey(imported[0].id))).toBeNull();
    expect(getStreams(imported[0].id)).toBeNull();
  });

  it('dedups by startTime: re-import creates nothing and counts as known', () => {
    importParsedSessions([parsedRun()]);
    const second = importParsedSessions([parsedRun()]);
    expect(second.imported).toHaveLength(0);
    expect(second.skipped).toBe(1);
    expect(allSessions()).toHaveLength(1);
  });

  it('dedups within a single batch too', () => {
    const { imported, skipped } = importParsedSessions([parsedRun(), parsedRun()]);
    expect(imported).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('imports distinct workouts on the same day as separate entities (Double)', () => {
    const { imported } = importParsedSessions([
      parsedRun(),
      parsedRun({ startTime: '2026-07-10T17:00:00.000Z', duration: 45 }),
    ]);
    expect(imported).toHaveLength(2);
    expect(imported[0].dayOrder).not.toBe(imported[1].dayOrder);
  });

  it('skips entries without date or startTime instead of throwing', () => {
    const { imported, skipped } = importParsedSessions([
      parsedRun({ date: null }),
      parsedRun({ startTime: null }),
    ]);
    expect(imported).toHaveLength(0);
    expect(skipped).toBe(0);
    expect(allSessions()).toHaveLength(0);
  });

  it('handles empty and missing input', () => {
    expect(importParsedSessions([])).toEqual({ imported: [], skipped: 0 });
    expect(importParsedSessions()).toEqual({ imported: [], skipped: 0 });
  });
});

// ── Calendar matching (issue gs-03) ──────────────────────────────────────────

describe('planned-session matching', () => {
  it('completes the planned session in place: same id, one dot, Coach fields kept', () => {
    const planned = createSession({ dateKey: '2026-07-10', type: 'Endurance', status: 'planned' });
    const { imported } = importParsedSessions([parsedRun()]);

    expect(imported[0].id).toBe(planned.id);
    expect(imported[0].status).toBe('completed');
    expect(imported[0].origin).toBe('coach');       // Coach content survives
    expect(imported[0].zone).toBe(planned.zone);
    expect(imported[0].note).toBe(planned.note);
    expect(imported[0].duration).toBe('62 min');    // recorded reality replaces the plan
    expect(imported[0].source).toBe('garmin');
    expect(sessionsForDay('2026-07-10')).toHaveLength(1);
    expect(getStreams(planned.id)).not.toBeNull();
  });

  it('prefers a same-type match on a Double day regardless of dayOrder', () => {
    const recovery  = createSession({ dateKey: '2026-07-10', type: 'Recovery',  status: 'planned' });
    const endurance = createSession({ dateKey: '2026-07-10', type: 'Endurance', status: 'planned' });
    const { imported } = importParsedSessions([parsedRun({ sessionType: 'Endurance' })]);

    expect(imported[0].id).toBe(endurance.id);
    expect(allSessions().find(s => s.id === recovery.id).status).toBe('planned');
  });

  it('two uploads complete both planned sessions of a Double; a third becomes standalone', () => {
    createSession({ dateKey: '2026-07-10', type: 'Endurance', status: 'planned' });
    createSession({ dateKey: '2026-07-10', type: 'Recovery',  status: 'planned' });
    const { imported } = importParsedSessions([
      parsedRun({ startTime: '2026-07-10T06:00:00.000Z' }),
      parsedRun({ startTime: '2026-07-10T12:00:00.000Z' }),
      parsedRun({ startTime: '2026-07-10T18:00:00.000Z' }),
    ]);

    expect(imported).toHaveLength(3);
    const day = sessionsForDay('2026-07-10');
    expect(day).toHaveLength(3);
    expect(day.filter(s => s.status === 'completed')).toHaveLength(3);
    expect(day.filter(s => s.origin === 'garmin')).toHaveLength(1); // only the third is standalone
  });

  it('never matches a parked session', () => {
    const parked = createSession({ dateKey: '2026-07-10', type: 'Endurance', status: 'planned', parked: true });
    const { imported } = importParsedSessions([parsedRun()]);

    expect(imported[0].id).not.toBe(parked.id);
    expect(allSessions().find(s => s.id === parked.id).status).toBe('planned');
    expect(sessionsForDay('2026-07-10')).toHaveLength(2);
  });

  it('never matches an already-completed session', () => {
    const done = createSession({ dateKey: '2026-07-10', type: 'Endurance', status: 'completed' });
    const { imported } = importParsedSessions([parsedRun()]);
    expect(imported[0].id).not.toBe(done.id);
  });
});

// ── Rating chain (issue gs-03) ────────────────────────────────────────────────

describe('pickRatingCandidate', () => {
  const TODAY = '2026-07-15';
  const e = dateKey => ({ id: 'x' + dateKey, dateKey });

  it('one workout dated today → that workout', () => {
    expect(pickRatingCandidate([e('2026-07-15')], TODAY)?.dateKey).toBe('2026-07-15');
  });

  it('one workout dated yesterday → that workout', () => {
    expect(pickRatingCandidate([e('2026-07-14')], TODAY)?.dateKey).toBe('2026-07-14');
  });

  it('a backfill batch with no recent workout → none', () => {
    expect(pickRatingCandidate([e('2026-06-01'), e('2026-06-08')], TODAY)).toBeNull();
  });

  it('two recent workouts → none (never guess which to rate)', () => {
    expect(pickRatingCandidate([e('2026-07-15'), e('2026-07-14')], TODAY)).toBeNull();
  });

  it('a mixed batch with exactly one recent workout → the recent one', () => {
    expect(pickRatingCandidate([e('2026-06-01'), e('2026-07-15')], TODAY)?.dateKey).toBe('2026-07-15');
  });

  it('empty input → none', () => {
    expect(pickRatingCandidate([], TODAY)).toBeNull();
  });
});
