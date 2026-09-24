import { describe, it, expect } from 'vitest';
import type { ParsedSession } from './garmin';
import { externalIdOf, planHistoryImport } from './history-import';

/**
 * `garmin-integration/03` — which of an uploaded history's activities land as
 * history, which become proposals, and which are already on file. Pure: parsed
 * activities and the athlete's planned days in, two lists out.
 */
function parsed(over: Partial<ParsedSession> = {}): ParsedSession {
  return {
    date: '2026-08-01',
    sessionType: 'Endurance',
    duration: 45,
    note: 'Imported from Garmin',
    startTime: '2026-08-01T06:30:00.000Z',
    sport: 'running',
    summary: { avgHr: null, maxHr: null, avgSpeedMps: null, distanceM: null, ascentM: null, avgPowerW: null },
    streams: {} as ParsedSession['streams'],
    ...over,
  };
}

describe('externalIdOf', () => {
  it('keys an activity by its start time, and gives none to one without', () => {
    expect(externalIdOf(parsed({ startTime: '2026-08-01T06:30:00.000Z' }))).toBe('garmin:2026-08-01T06:30:00.000Z');
    expect(externalIdOf(parsed({ startTime: null }))).toBeNull();
  });
});

describe('planHistoryImport', () => {
  it('proposes an activity on a planned day and keeps the rest as history', () => {
    const plan = planHistoryImport([parsed({ date: '2026-08-01', startTime: 'A' }), parsed({ date: '2026-08-02', startTime: 'B' })], {
      planned: [{ id: 's1', date: '2026-08-02', status: 'planned', parked: false }],
      knownIds: new Set(),
    });
    expect(plan.history.map((p) => p.date)).toEqual(['2026-08-01']);
    expect(plan.proposals.map((p) => p.date)).toEqual(['2026-08-02']);
  });

  it('keeps an activity as history when its day’s session is done, skipped or parked', () => {
    // The same eligibility the detection path uses: only a still-planned,
    // unparked session can take an activity's completion.
    const plan = planHistoryImport(
      [parsed({ date: '2026-08-01', startTime: 'A' }), parsed({ date: '2026-08-02', startTime: 'B' }), parsed({ date: '2026-08-03', startTime: 'C' })],
      {
        planned: [
          { id: 's1', date: '2026-08-01', status: 'completed', parked: false },
          { id: 's2', date: '2026-08-02', status: 'skipped', parked: false },
          { id: 's3', date: '2026-08-03', status: 'planned', parked: true },
        ],
        knownIds: new Set(),
      },
    );
    expect(plan.history.map((p) => p.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(plan.proposals).toEqual([]);
  });

  it('drops what is already on file or repeated, and keeps every keyless activity', () => {
    const a = parsed({ startTime: 'T1' });
    const dupe = parsed({ startTime: 'T1' });
    const known = parsed({ startTime: 'T0' });
    const k1 = parsed({ startTime: null, duration: 40 });
    const k2 = parsed({ startTime: null, duration: 41 });
    const plan = planHistoryImport([a, dupe, known, k1, k2], { planned: [], knownIds: new Set(['garmin:T0']) });
    expect(plan.history).toEqual([a, k1, k2]);
    expect(plan.history[0]).toBe(a);
  });

  it('drops a known activity even when its day has a plan', () => {
    const plan = planHistoryImport([parsed({ date: '2026-08-02', startTime: 'T0' })], {
      planned: [{ id: 's1', date: '2026-08-02', status: 'planned', parked: false }],
      knownIds: new Set(['garmin:T0']),
    });
    expect(plan).toEqual({ history: [], proposals: [] });
  });
});
