import { describe, it, expect } from 'vitest';
import {
  PANELS,
  availablePanels,
  periodSplit,
  rampRates,
  weeklyAvg,
  sportSplit,
} from './panels';
import { emptyDataset, type InfoDataset } from './dataset';
import { syntheticDataset } from './synthetic-fixtures';

const TODAY = '2026-07-14';
const rich = syntheticDataset('rich', TODAY);

// One synthetic reading per panel id — the minimal dataset that must make the
// panel's predicate flip true. Every new panel MUST add its row here.
const ONE_SESSION = {
  id: 's0',
  date: TODAY,
  week: 0,
  title: 'Easy Run',
  sport: 'run',
  type: 'Recovery',
  durMin: 30,
  km: 5,
  tss: 20,
  power: null,
  hr: null,
  kj: null,
  body: 6,
  mind: 7,
  comment: '',
  status: 'done' as const,
};
const ONE_WEEK = {
  week: 0,
  tss: 20,
  minutes: 30,
  kj: 0,
  done: 1,
  skipped: 0,
  fitness: 3,
  fatigue: 8,
  form: -5,
  zones: null,
  longest: 30,
};
const ONE_PEAK = { label: 'Jul', '5s': 700, '1m': 350, '5m': 260, '20m': 220, '60m': 195 };

function oneReadingFor(id: string): InfoDataset {
  const D = emptyDataset();
  switch (id) {
    case 'bodymind':
    case 'split-dur':
    case 'split-dist':
      D.sessions.push({ ...ONE_SESSION });
      return D;
    case 'ffnow':
    case 'load':
    case 'ramp':
    case 'consistency':
    case 'hours':
    case 'longest':
      D.weekly.push({ ...ONE_WEEK });
      return D;
    case 'work':
      D.weekly.push({ ...ONE_WEEK, kj: 270 });
      return D;
    case 'zones':
      D.weekly.push({ ...ONE_WEEK, zones: [40, 30, 15, 10, 5] });
      return D;
    case 'race':
      D.weeksToRace = 24;
      D.raceName = 'Assundman 70.3';
      return D;
    case 'checkin':
      D.checkins.push({ week: 0, energy: 7, sleepq: 6, mood: 8, motivation: 9 });
      return D;
    case 'sleep':
      D.sleep.push({ day: 0, hours: 7.2, feeling: 4 });
      return D;
    case 'peaks-power':
      D.peaksPower.push({ ...ONE_PEAK });
      return D;
    case 'bests':
      D.bests.push({ date: TODAY, week: 0, metricKey: 'bestPower5s', sport: 'bike', value: '850 W' });
      return D;
    case 'peaks-hr':
      D.peaksHr.push({ label: 'Jul', '5s': 190, '1m': 182, '5m': 176, '20m': 170, '60m': 162 });
      return D;
    case 'period':
      // "One reading" for a comparison is the smallest pair of blocks: two
      // weeks, one on each side of the split.
      D.weekly.push({ ...ONE_WEEK, week: 1 }, { ...ONE_WEEK });
      return D;
    default:
      throw new Error(`No one-reading fixture for panel '${id}' — add one to panels.test.ts`);
  }
}

describe('one-reading rule — every panel in the catalog', () => {
  for (const p of PANELS) {
    it(`${p.id}: predicate false on empty dataset`, () => {
      expect(p.has(emptyDataset())).toBe(false);
    });
    it(`${p.id}: predicate true with exactly one reading`, () => {
      expect(p.has(oneReadingFor(p.id))).toBe(true);
    });
  }
});

describe('availablePanels', () => {
  it('returns nothing for an empty dataset — no dead panels', () => {
    expect(availablePanels(emptyDataset())).toHaveLength(0);
  });
  it('rich data renders the full catalog', () => {
    expect(availablePanels(rich)).toHaveLength(PANELS.length);
  });
  it('fresh data excludes wearable-dependent panels (zones, peaks, bests)', () => {
    const fresh = syntheticDataset('fresh', TODAY);
    const ids = availablePanels(fresh).map((p) => p.id);
    expect(ids).not.toContain('zones');
    expect(ids).not.toContain('peaks-power');
    expect(ids).not.toContain('peaks-hr');
    expect(ids).not.toContain('bests');
    expect(ids).toContain('bodymind');
    expect(ids.length).toBeLessThan(PANELS.length);
  });
});

describe('series() — Comparison Graph capability', () => {
  const seriesCapable = PANELS.filter((p) => p.series);

  it('the time-series panels declare it; tiles, tables, and donuts do not', () => {
    expect(seriesCapable.map((p) => p.id).sort()).toEqual([
      'bodymind',
      'checkin',
      'consistency',
      'hours',
      'load',
      'longest',
      'sleep',
      'work',
    ]);
    for (const id of ['ffnow', 'race', 'split-dur', 'split-dist', 'zones', 'peaks-power', 'peaks-hr']) {
      expect(PANELS.find((p) => p.id === id)?.series).toBeUndefined();
    }
  });

  for (const p of seriesCapable) {
    it(`${p.id}: series(rich) yields labeled, colored, finite numeric values`, () => {
      const entries = p.series!(rich);
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.labelKey).toBeTruthy();
        expect(e.color).toBeTruthy();
        expect(e.values.length).toBeGreaterThan(0);
        for (const v of e.values) expect(Number.isFinite(v)).toBe(true);
      }
    });
    it(`${p.id}: series works on a one-reading dataset`, () => {
      for (const e of p.series!(oneReadingFor(p.id))) {
        for (const v of e.values) expect(Number.isFinite(v)).toBe(true);
      }
    });
  }
});

describe('weeklyAvg — Session Reflection weekly means', () => {
  it('averages per week, oldest → newest', () => {
    const D = emptyDataset();
    D.sessions.push(
      { ...ONE_SESSION, id: 'a', week: 1, body: 4 },
      { ...ONE_SESSION, id: 'b', week: 1, body: 6 },
      { ...ONE_SESSION, id: 'c', week: 0, body: 8 },
      { ...ONE_SESSION, id: 'd', week: 0, body: null },
    );
    expect(weeklyAvg(D, 'body')).toEqual([5, 8]);
  });
});

describe('sportSplit — completed totals by sport bucket', () => {
  it('groups sessions without Garmin provenance under other, never drops them', () => {
    const D = emptyDataset();
    D.sessions.push(
      { ...ONE_SESSION, id: 'a', sport: 'run', durMin: 60 },
      { ...ONE_SESSION, id: 'b', sport: null, durMin: 30 },
      { ...ONE_SESSION, id: 'c', sport: 'run', durMin: 30, status: 'skipped' },
    );
    const parts = sportSplit(D, 'durMin');
    expect(parts.map((p) => [p.sport, p.value])).toEqual([
      ['run', 60],
      ['other', 30],
    ]);
    expect(parts.map((p) => p.pct)).toEqual([67, 33]);
  });

  it('null metric values count as zero rather than poisoning the total', () => {
    const D = emptyDataset();
    D.sessions.push(
      { ...ONE_SESSION, id: 'a', km: 12 },
      { ...ONE_SESSION, id: 'b', km: null },
    );
    const parts = sportSplit(D, 'km');
    expect(parts).toHaveLength(1);
    expect(parts[0].value).toBe(12);
  });
});

describe('periodSplit — this block against the last', () => {
  const week = (w: number, over: Partial<typeof ONE_WEEK> = {}) => ({
    ...ONE_WEEK,
    week: w,
    ...over,
  });

  it('splits an even history into halves and aggregates each', () => {
    const D = emptyDataset();
    D.weekly.push(
      week(3, { minutes: 60, done: 2, skipped: 1, longest: 60 }),
      week(2, { minutes: 120, done: 3, skipped: 0, longest: 90 }),
      week(1, { minutes: 180, done: 4, skipped: 0, longest: 120 }),
      week(0, { minutes: 120, done: 3, skipped: 1, longest: 100 }),
    );
    D.sessions.push(
      { ...ONE_SESSION, id: 'a', week: 0, body: 6, mind: 8 },
      { ...ONE_SESSION, id: 'b', week: 1, body: 8, mind: null },
      { ...ONE_SESSION, id: 'c', week: 2, body: 4, mind: 4 },
    );
    const split = periodSplit(D)!;
    expect(split.weeks).toBe(2);
    expect(split.current).toEqual({
      hours: 5, // (180 + 120) / 60
      completed: 7,
      skipped: 1,
      longest: 120,
      body: 7, // (6 + 8) / 2
      mind: 8, // the null Mind rating is excluded, not zeroed
    });
    expect(split.previous).toMatchObject({ hours: 3, completed: 5, skipped: 1, longest: 90, body: 4 });
  });

  it('an odd history compares the newest two full blocks and drops the oldest week', () => {
    const D = emptyDataset();
    D.weekly.push(week(4, { minutes: 600 }), week(3), week(2), week(1), week(0));
    const split = periodSplit(D)!;
    expect(split.weeks).toBe(2);
    // week 4's 600 minutes are in neither block
    expect(split.current.hours + split.previous.hours).toBe(2);
  });

  it('needs a full block on each side: one week of history is not comparable', () => {
    const D = emptyDataset();
    D.weekly.push(week(0));
    expect(periodSplit(D)).toBeNull();
    expect(periodSplit(emptyDataset())).toBeNull();
  });

  it('a block with no rated sessions has null Body/Mind, not zero', () => {
    const D = emptyDataset();
    D.weekly.push(week(1), week(0));
    expect(periodSplit(D)!.current.body).toBeNull();
    expect(periodSplit(D)!.previous.mind).toBeNull();
  });
});

describe('rampRates — delta math', () => {
  const rows: Array<[string, number[], Array<[string, number]>]> = [
    ['26 weeks: all four windows', Array.from({ length: 53 }, (_, i) => i), [['7d', 1], ['28d', 4], ['90d', 13], ['365d', 52]]],
    ['5 weeks: 7d + 28d only', [10, 12, 11, 14, 16], [['7d', 2], ['28d', 6]]],
    ['negative deltas (fading)', [30, 28, 25], [['7d', -3]]],
    ['flat is ±0, not hidden', [20, 20], [['7d', 0]]],
  ];
  for (const [name, values, expected] of rows) {
    it(name, () => {
      expect(rampRates(values).map((tl) => [tl.label, tl.delta])).toEqual(expected);
    });
  }
  it('a single reading yields one honest delta-less tile', () => {
    expect(rampRates([15])).toEqual([{ label: '7d', delta: null, spark: [15] }]);
  });
  it('empty series yields no tiles', () => {
    expect(rampRates([])).toEqual([]);
  });
  it('sparklines cover exactly their window', () => {
    const tiles = rampRates([1, 2, 3, 4, 5, 6]);
    expect(tiles.find((tl) => tl.label === '7d')?.spark).toEqual([5, 6]);
    expect(tiles.find((tl) => tl.label === '28d')?.spark).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('catalog integrity', () => {
  it('every panel has id, familyKey, titleKey, has', () => {
    for (const p of PANELS) {
      expect(p.id).toBeTruthy();
      expect(p.familyKey).toMatch(/^family/);
      expect(p.titleKey).toMatch(/^panel/);
      expect(typeof p.has).toBe('function');
    }
  });
  it('panel ids are unique', () => {
    const ids = PANELS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
