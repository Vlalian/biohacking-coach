// Synthetic data provider — determinism and shape invariants.
// Pure node: no DOM, no storage.
import { describe, it, expect } from 'vitest';
import { getDataset, emptyDataset, DATASET_STATES } from '../public/js/infodata.js';

const TODAY = '2026-07-14';

describe('getDataset — determinism', () => {
  for (const state of DATASET_STATES) {
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
