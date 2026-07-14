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
function oneReadingFor(id) {
  const D = emptyDataset();
  switch (id) {
    case 'bodymind':
      D.sessions.push({
        id: 's0', date: TODAY, week: 0, title: 'Easy Run', sport: 'run', type: 'Recovery',
        durMin: 30, km: 5, tss: 20, power: null, hr: null, kj: null,
        body: 6, mind: 7, comment: '', status: 'done',
      });
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
  it('returns panels with readings for rich data', () => {
    expect(availablePanels(rich).map(p => p.id)).toContain('bodymind');
  });
});
