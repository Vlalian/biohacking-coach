// Synthetic data provider — determinism and shape invariants.
// Pure node: no DOM, no storage. The 'mine' state needs localStorage and is
// covered in garmin.mine.test.mjs under jsdom.
import { describe, it, expect } from 'vitest';
import { getDataset, emptyDataset, windowDataset, SYNTHETIC_STATES } from '../public/js/infodata.js';

const TODAY = '2026-07-14';

describe('getDataset — determinism', () => {
  for (const state of SYNTHETIC_STATES) {
    it(`same state + same reference date → identical dataset (${state})`, () => {
      const a = getDataset(state, { today: TODAY });
      const b = getDataset(state, { today: TODAY });
      expect(a).toEqual(b);
    });
  }

  it('unknown state throws', () => {
    expect(() => getDataset('bogus')).toThrow(/Unknown dataset state/);
  });
});

describe('getDataset — shape invariants', () => {
  const rich  = getDataset('rich',  { today: TODAY });
  const fresh = getDataset('fresh', { today: TODAY });

  it('rich spans 26 weeks, fresh spans 1', () => {
    expect(rich.weekly).toHaveLength(26);
    expect(fresh.weekly).toHaveLength(1);
  });

  it('weekly and checkins are oldest → newest', () => {
    expect(rich.weekly[0].week).toBeGreaterThan(rich.weekly[25].week);
    expect(rich.checkins[0].week).toBeGreaterThan(rich.checkins[25].week);
  });

  it('every session carries the full field set', () => {
    for (const s of [...rich.sessions, ...fresh.sessions]) {
      expect(s).toMatchObject({
        id: expect.any(String), date: expect.any(String), week: expect.any(Number),
        title: expect.any(String), sport: expect.any(String), type: expect.any(String),
        durMin: expect.any(Number), km: expect.any(Number), tss: expect.any(Number),
        status: expect.stringMatching(/^(done|skipped)$/),
      });
    }
  });

  it('done sessions have Body and Mind Feedback in RPE range; skipped have none', () => {
    for (const s of rich.sessions) {
      if (s.status === 'done') {
        expect(s.body).toBeGreaterThanOrEqual(1); expect(s.body).toBeLessThanOrEqual(10);
        expect(s.mind).toBeGreaterThanOrEqual(1); expect(s.mind).toBeLessThanOrEqual(10);
      } else {
        expect(s.body).toBeNull(); expect(s.mind).toBeNull();
      }
    }
  });

  it('wearable-dependent data (peaks) exists in rich, is absent in fresh', () => {
    expect(rich.peaksPower.length).toBeGreaterThan(0);
    expect(rich.peaksHr.length).toBeGreaterThan(0);
    expect(fresh.peaksPower).toHaveLength(0);
    expect(fresh.peaksHr).toHaveLength(0);
  });

  it('emptyDataset has every key of a generated dataset, all empty', () => {
    const empty = emptyDataset();
    for (const key of Object.keys(rich)) expect(empty).toHaveProperty(key);
    expect(empty.sessions).toHaveLength(0);
    expect(empty.weekly).toHaveLength(0);
    expect(empty.weeksToRace).toBeNull();
  });
});

describe('windowDataset — time-range clipping', () => {
  const rich = getDataset('rich', { today: TODAY });

  it('null weeks = all history, untouched', () => {
    expect(windowDataset(rich, null)).toEqual(rich);
  });

  const rows = [
    // [weeks, expected weekly rows, expected peaks rows]
    [4,  4,  1],
    [12, 12, 3],
    [52, 26, 6], // window larger than history: everything, no padding
  ];
  for (const [weeks, weeklyRows, peaksRows] of rows) {
    it(`last ${weeks} weeks → ${weeklyRows} weekly rows, ${peaksRows} peaks rows`, () => {
      const w = windowDataset(rich, weeks);
      expect(w.weekly).toHaveLength(weeklyRows);
      expect(w.checkins).toHaveLength(weeklyRows);
      expect(w.peaksPower).toHaveLength(peaksRows);
      expect(w.weekly.every(x => x.week < weeks)).toBe(true);
      expect(w.sessions.every(x => x.week < weeks)).toBe(true);
      expect(w.sleep.every(x => x.day < weeks * 7)).toBe(true);
    });
  }

  it('keeps the newest entries, oldest → newest order intact', () => {
    const w = windowDataset(rich, 4);
    expect(w.weekly.map(x => x.week)).toEqual([3, 2, 1, 0]);
  });

  it('race facts are about the future and never clipped', () => {
    const w = windowDataset(rich, 4);
    expect(w.weeksToRace).toBe(rich.weeksToRace);
    expect(w.raceName).toBe(rich.raceName);
  });

  it('a window with no readings empties the collection — panels then disappear', () => {
    const D = emptyDataset();
    D.sessions.push({ id: 's', date: '2026-05-01', week: 10, title: 'Old Run', sport: 'run', type: 'Endurance', durMin: 60, km: 10, tss: 40, power: null, hr: null, kj: null, body: 5, mind: 5, comment: '', status: 'done' });
    expect(windowDataset(D, 4).sessions).toHaveLength(0);
  });
});
