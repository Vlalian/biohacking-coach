import { describe, it, expect } from 'vitest';
import { filterSessions, canCompare, extractColumns, normalize } from './compare';
import type { InfoSession } from './dataset';

const S = (id: string, over: Partial<InfoSession> = {}): InfoSession => ({
  id,
  date: '2026-07-01',
  week: 0,
  title: 'T',
  sport: 'run',
  type: 'Endurance',
  durMin: 60,
  km: 10,
  tss: 40,
  power: null,
  hr: null,
  kj: null,
  body: 5,
  mind: 6,
  comment: '',
  status: 'done',
  ...over,
});

const SESSIONS = [
  S('a', { date: '2026-07-01', sport: 'run', type: 'Endurance' }),
  S('b', { date: '2026-07-03', sport: 'bike', type: 'Intensity', power: 220, hr: 150 }),
  S('c', { date: '2026-07-02', sport: 'bike', type: 'Endurance' }),
  S('d', { date: '2026-07-04', sport: 'swim', type: 'Tempo' }),
  S('e', { date: '2026-07-05', sport: 'run', type: 'Endurance', status: 'skipped', body: null, mind: null }),
];

describe('filterSessions — matrix', () => {
  const rows: Array<[string, string, string[]]> = [
    // [sport, type, expected ids (newest first)]
    ['all', 'all', ['d', 'b', 'c', 'a']],
    ['bike', 'all', ['b', 'c']],
    ['all', 'Endurance', ['c', 'a']],
    ['bike', 'Endurance', ['c']],
    ['bike', 'Intensity', ['b']],
    ['swim', 'Intensity', []],
  ];
  for (const [sport, type, expected] of rows) {
    it(`sport=${sport} type=${type} → [${expected}]`, () => {
      expect(filterSessions(SESSIONS, { sport, type }).map((s) => s.id)).toEqual(expected);
    });
  }
  it('skipped sessions are never listed', () => {
    expect(filterSessions(SESSIONS, {}).map((s) => s.id)).not.toContain('e');
  });
  it('does not mutate the input order', () => {
    const before = SESSIONS.map((s) => s.id);
    filterSessions(SESSIONS, {});
    expect(SESSIONS.map((s) => s.id)).toEqual(before);
  });
});

describe('canCompare', () => {
  it('threshold is 2', () => {
    expect(canCompare([])).toBe(false);
    expect(canCompare(['a'])).toBe(false);
    expect(canCompare(['a', 'b'])).toBe(true);
    expect(canCompare(['a', 'b', 'c'])).toBe(true);
  });
});

describe('extractColumns', () => {
  it('optional metrics are omitted, not blank; Body/Mind always present', () => {
    const [noPower, withPower] = extractColumns([SESSIONS[0], SESSIONS[1]]);
    expect(noPower.rows.map((r) => r[0])).not.toContain('avgPower');
    expect(withPower.rows.map((r) => r[0])).toContain('avgPower');
    expect(withPower.rows.map((r) => r[0])).toContain('avgHr');
    for (const col of [noPower, withPower]) {
      expect(col.body).not.toBeUndefined();
      expect(col.mind).not.toBeUndefined();
    }
  });

  it('real-data absences (duration, distance, TSS) are omitted the same way', () => {
    const [col] = extractColumns([S('x', { durMin: null, km: null, tss: null })]);
    expect(col.rows).toEqual([]);
    expect(col.body).toBe(5);
    expect(col.mind).toBe(6);
  });

  it('carries the comment when present', () => {
    const [col] = extractColumns([S('x', { comment: '60g carbs/h' })]);
    expect(col.comment).toBe('60g carbs/h');
  });
});

describe('normalize — Comparison Graph scaling', () => {
  const rows: Array<[string, number[], number[]]> = [
    ['scales to 0–1 over the series range', [10, 20, 30], [0, 0.5, 1]],
    ['negative ranges work (Form can be negative)', [-10, 0, 10], [0, 0.5, 1]],
    ['flat series maps to the midline, not a crash', [7, 7, 7], [0.5, 0.5, 0.5]],
    ['single reading maps to the midline', [42], [0.5]],
    ['empty stays empty', [], []],
  ];
  for (const [name, input, expected] of rows) {
    it(name, () => {
      expect(normalize(input)).toEqual(expected);
    });
  }
  it('never yields NaN or Infinity', () => {
    for (const input of [[0], [0, 0], [1e9, -1e9], [0.0001, 0.0002]]) {
      for (const v of normalize(input)) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
