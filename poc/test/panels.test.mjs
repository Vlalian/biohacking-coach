// Panel Catalog — the one-reading rule and render sanity, table-driven over
// EVERY panel in the catalog. Pure node: no DOM, no storage, no translations
// (labels via identity t).
import { describe, it, expect } from 'vitest';
import { PANELS, availablePanels, panelById } from '../public/js/panels.js';
import { getDataset, emptyDataset } from '../public/js/infodata.js';

const TODAY = '2026-07-14';
const rich = getDataset('rich', { today: TODAY });

// One synthetic reading per panel id — the minimal dataset that must make the
// panel's predicate flip true. Every new panel MUST add its row here.
const ONE_SESSION = {
  id: 's0', date: TODAY, week: 0, title: 'Easy Run', sport: 'run', type: 'Recovery',
  durMin: 30, km: 5, tss: 20, power: null, hr: null, kj: null,
  body: 6, mind: 7, comment: '', status: 'done',
};
const ONE_WEEK = {
  week: 0, tss: 20, min: 30, kj: 0, done: 1, skipped: 0,
  fitness: 3, fatigue: 8, form: -5, zones: null, longest: 30,
};
const ONE_PEAK = { label: 'Jul', '5s': 700, '1m': 350, '5m': 260, '20m': 220, '60m': 195 };

function oneReadingFor(id) {
  const D = emptyDataset();
  switch (id) {
    case 'bodymind':
    case 'split-dur':
    case 'split-dist':
      D.sessions.push({ ...ONE_SESSION });
      return D;
    case 'ffnow':
    case 'load':
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
      D.weeksToRace = 24; D.raceName = 'Assundman 70.3';
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
      D.bests.push({ date: TODAY, week: 0, metricKey: 'infoBestPower5s', sport: 'bike', value: '850 W' });
      return D;
    case 'peaks-hr':
      D.peaksHr.push({ label: 'Jul', '5s': 190, '1m': 182, '5m': 176, '20m': 170, '60m': 162 });
      return D;
    default:
      throw new Error(`No one-reading fixture for panel '${id}' — add one to panels.test.mjs`);
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

describe('render sanity — every panel in the catalog', () => {
  for (const p of PANELS) {
    it(`${p.id}: rich render has no NaN and resolves labels through t`, () => {
      const html = p.render(rich, { t: k => `[${k}]` });
      expect(html).not.toContain('NaN');
      expect(html).not.toContain('Infinity');
    });
    it(`${p.id}: renders sanely with a single reading`, () => {
      const html = p.render(oneReadingFor(p.id), { t: k => k });
      expect(html).not.toContain('NaN');
      expect(html.length).toBeGreaterThan(0);
    });
  }

  it('bodymind: a single reading draws a dot, not a degenerate path', () => {
    const html = panelById('bodymind').render(oneReadingFor('bodymind'), { t: k => k });
    expect(html).toContain('<circle');
  });
});

describe('availablePanels', () => {
  it('returns nothing for an empty dataset — no dead panels', () => {
    expect(availablePanels(emptyDataset())).toHaveLength(0);
  });
  it('rich data renders the full catalog', () => {
    expect(availablePanels(rich)).toHaveLength(PANELS.length);
  });
  it('fresh data excludes wearable-dependent panels (zones, peaks, bests)', () => {
    const fresh = getDataset('fresh', { today: TODAY });
    const ids = availablePanels(fresh).map(p => p.id);
    expect(ids).not.toContain('zones');
    expect(ids).not.toContain('peaks-power');
    expect(ids).not.toContain('peaks-hr');
    expect(ids).not.toContain('bests');
    expect(ids).toContain('bodymind');
    expect(ids.length).toBeLessThan(PANELS.length);
  });

  it('bests render newest-first, capped at 6 rows', () => {
    const html = panelById('bests').render(rich, { t: k => k });
    const dates = [...html.matchAll(/iv-bestdate">([\d-]+)</g)].map(m => m[1]);
    expect(dates.length).toBeLessThanOrEqual(6);
    expect(dates.length).toBeGreaterThan(1);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe('series() — Comparison Graph capability', () => {
  const seriesCapable = PANELS.filter(p => p.series);

  it('the time-series panels declare it; tiles, tables, and donuts do not', () => {
    expect(seriesCapable.map(p => p.id).sort()).toEqual(
      ['bodymind', 'checkin', 'consistency', 'hours', 'load', 'longest', 'sleep', 'work']);
    for (const id of ['ffnow', 'race', 'split-dur', 'split-dist', 'zones', 'peaks-power', 'peaks-hr']) {
      expect(PANELS.find(p => p.id === id).series).toBeUndefined();
    }
  });

  for (const p of seriesCapable) {
    it(`${p.id}: series(rich) yields labeled, colored, finite numeric values`, () => {
      const entries = p.series(rich);
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.labelKey).toBeTruthy();
        expect(e.color).toBeTruthy();
        expect(e.values.length).toBeGreaterThan(0);
        for (const v of e.values) expect(Number.isFinite(v)).toBe(true);
      }
    });
    it(`${p.id}: series works on a one-reading dataset`, () => {
      for (const e of p.series(oneReadingFor(p.id))) {
        for (const v of e.values) expect(Number.isFinite(v)).toBe(true);
      }
    });
  }
});

describe('catalog integrity', () => {
  it('every panel has id, familyKey, titleKey, has, render', () => {
    for (const p of PANELS) {
      expect(p.id).toBeTruthy();
      expect(p.familyKey).toMatch(/^infoFamily/);
      expect(p.titleKey).toMatch(/^infoPanel/);
      expect(typeof p.has).toBe('function');
      expect(typeof p.render).toBe('function');
    }
  });
  it('panel ids are unique', () => {
    const ids = PANELS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
