// @vitest-environment jsdom
// Information View orchestrator — story tests through the exported render,
// following the calendar suites' conventions (resetModules + dynamic import).
import { describe, it, expect, beforeEach, vi } from 'vitest';

let renderInformation;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = `<div id="information-view" style="display:none;"></div>`;
  window._language = 'English';
  ({ renderInformation } = await import('../public/js/infoview.js'));
});

describe('renderInformation', () => {
  it('renders the Body & Mind Feedback panel from provider data', () => {
    renderInformation();
    const panel = document.querySelector('.iv-panel[data-panel="bodymind"]');
    expect(panel).not.toBeNull();
    expect(panel.querySelector('.iv-ptitle').textContent).toBe('Body & Mind Feedback');
    expect(panel.querySelector('svg')).not.toBeNull();
    expect(panel.innerHTML).not.toContain('NaN');
  });

  it('renders no empty-state placeholders — only panels with readings', () => {
    renderInformation();
    const feed = document.querySelector('.iv-feed');
    expect(feed.querySelectorAll('.iv-panel').length).toBeGreaterThan(0);
    expect(feed.textContent).not.toMatch(/no data|No metrics/i);
  });

  it('labels follow the Athlete Language (Danish)', () => {
    localStorage.setItem('bca_language', 'Dansk');
    renderInformation();
    expect(document.querySelector('.iv-panel[data-panel="bodymind"] .iv-ptitle').textContent).toBe('Krop & Hoved-feedback');
    expect(document.querySelector('#information-view h1').textContent).toBe('Information');
  });

  it('is idempotent — re-render does not duplicate panels', () => {
    renderInformation();
    const first = document.querySelectorAll('.iv-panel').length;
    renderInformation();
    expect(document.querySelectorAll('.iv-panel').length).toBe(first);
  });

  it('one-reading growth: fresh shows fewer panels than rich, and the count says so', async () => {
    const { setDataState } = await import('../public/js/infoview.js');
    renderInformation();
    const richCount = document.querySelectorAll('.iv-panel').length;
    expect(document.querySelector('.iv-hint').textContent).toContain(`${richCount} of`);

    setDataState('fresh');
    const freshCount = document.querySelectorAll('.iv-panel').length;
    expect(freshCount).toBeLessThan(richCount);
    expect(freshCount).toBeGreaterThan(0);
    expect(document.querySelector('.iv-hint').textContent).toContain(`${freshCount} of`);
    expect(document.querySelector('.iv-panel[data-panel="zones"]')).toBeNull();

    setDataState('rich');
    expect(document.querySelectorAll('.iv-panel').length).toBe(richCount);
  });

  it('the banner buttons switch the dataset state', () => {
    renderInformation();
    document.querySelector('[data-datakind="fresh"]').click();
    expect(document.querySelector('[data-datakind="fresh"]').classList.contains('on')).toBe(true);
    expect(document.querySelector('.iv-panel[data-panel="peaks-power"]')).toBeNull();
    document.querySelector('[data-datakind="rich"]').click();
    expect(document.querySelector('.iv-panel[data-panel="peaks-power"]')).not.toBeNull();
  });
});

describe('index rail', () => {
  it('rail groups are ★ Favorites then panel families, available panels only', async () => {
    const { setDataState } = await import('../public/js/infoview.js');
    renderInformation();
    const groups = [...document.querySelectorAll('.iv-railgroup')].map(g => g.dataset.family);
    expect(groups).toEqual(['favorites', 'infoFamilyFormLoad', 'infoFamilyBodyMind', 'infoFamilyVolume', 'infoFamilyPeaks']);
    expect(document.querySelectorAll('.iv-railitem').length)
      .toBe(document.querySelectorAll('.iv-feed .iv-panel').length);

    setDataState('fresh');
    // Peaks & Zones family disappears entirely when none of its panels have a reading
    const freshGroups = [...document.querySelectorAll('.iv-railgroup')].map(g => g.dataset.family);
    expect(freshGroups).not.toContain('infoFamilyPeaks');
    expect(document.querySelectorAll('.iv-railitem').length)
      .toBe(document.querySelectorAll('.iv-feed .iv-panel').length);
    setDataState('rich');
  });

  it('feed order matches rail order', () => {
    renderInformation();
    const railIds = [...document.querySelectorAll('.iv-railitem')].map(b => b.dataset.jump);
    const feedIds = [...document.querySelectorAll('.iv-feed .iv-panel')].map(p => p.dataset.panel);
    expect(feedIds).toEqual(railIds);
  });

  it('clicking a rail entry scrolls its panel into view (exported handler)', () => {
    renderInformation();
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    document.querySelector('.iv-railitem[data-jump="sleep"]').click();
    expect(spy).toHaveBeenCalledTimes(1);
    const anchor = document.getElementById('iv-anchor-sleep');
    expect(spy.mock.instances?.[0] ?? anchor).toBeTruthy();
    expect(anchor.querySelector('.iv-panel[data-panel="sleep"]')).not.toBeNull();
  });

  it('jumpToPanel returns the anchor element for a rendered panel and null-ish otherwise', async () => {
    const { jumpToPanel } = await import('../public/js/infoview.js');
    renderInformation();
    Element.prototype.scrollIntoView = vi.fn();
    expect(jumpToPanel('load')).not.toBeNull();
    expect(jumpToPanel('nonexistent')).toBeNull();
  });
});

describe('Favorites', () => {
  const favIds  = () => [...document.querySelectorAll('.iv-railitem.fav')].map(b => b.dataset.jump);
  const feedIds = () => [...document.querySelectorAll('.iv-feed .iv-panel')].map(p => p.dataset.panel);

  it('first run shows the default Favorites set, pinned first in rail and feed', () => {
    renderInformation();
    expect(favIds()).toEqual(['ffnow', 'load', 'bodymind', 'sleep']);
    expect(feedIds().slice(0, 4)).toEqual(['ffnow', 'load', 'bodymind', 'sleep']);
  });

  it('starring promotes into the ★ group; unstarring returns the panel to its family', () => {
    renderInformation();
    document.querySelector('.iv-feed [data-star="race"]').click();
    expect(favIds()).toEqual(['ffnow', 'load', 'bodymind', 'sleep', 'race']);
    expect(feedIds()[4]).toBe('race');

    document.querySelector('.iv-rail [data-star="race"]').click();
    expect(favIds()).toEqual(['ffnow', 'load', 'bodymind', 'sleep']);
    // back in its family group, still reachable — no hide anywhere
    expect(document.querySelector('.iv-railitem[data-jump="race"]')).not.toBeNull();
    expect(feedIds()).toContain('race');
  });

  it('membership survives a reload (fresh module import, same localStorage)', async () => {
    renderInformation();
    document.querySelector('.iv-feed [data-star="race"]').click();

    vi.resetModules();
    document.body.innerHTML = `<div id="information-view"></div>`;
    const fresh = await import('../public/js/infoview.js');
    fresh.renderInformation();
    expect(favIds()).toEqual(['ffnow', 'load', 'bodymind', 'sleep', 'race']);
  });

  it('a favorited panel without a reading is absent from display but kept in the stored layout', async () => {
    const { setDataState } = await import('../public/js/infoview.js');
    renderInformation();
    document.querySelector('.iv-feed [data-star="peaks-power"]').click();
    expect(favIds()).toContain('peaks-power');

    setDataState('fresh');
    expect(favIds()).not.toContain('peaks-power');
    expect(document.querySelector('.iv-panel[data-panel="peaks-power"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem('bh_info_layout')).favorites).toContain('peaks-power');

    setDataState('rich');
    expect(favIds()).toContain('peaks-power');
  });

  it('every available panel is always in rail and feed — demote never hides', () => {
    renderInformation();
    // demote everything
    for (const id of ['ffnow', 'load', 'bodymind', 'sleep']) {
      document.querySelector(`.iv-rail [data-star="${id}"]`).click();
    }
    expect(favIds()).toEqual([]);
    expect(document.querySelectorAll('.iv-feed .iv-panel').length)
      .toBe(document.querySelectorAll('.iv-railitem').length);
    expect(document.querySelector('.iv-railgroup-fav')).toBeNull();
  });
});

describe('Session Comparison overlay', () => {
  beforeEach(() => renderInformation());

  const open = () => document.querySelector('[data-cmpopen]').click();
  const checkboxes = () => [...document.querySelectorAll('[data-cmpsel]')];

  it('open → select 2 → compare renders one column per session, Body/Mind always visible', () => {
    open();
    expect(document.querySelector('.iv-overlay')).not.toBeNull();
    expect(document.querySelector('[data-cmpgo]').disabled).toBe(true);

    checkboxes()[0].click();
    expect(document.querySelector('[data-cmpgo]').disabled).toBe(true); // still below threshold
    checkboxes().find(c => !c.checked).click();
    expect(document.querySelector('[data-cmpgo]').disabled).toBe(false);

    document.querySelector('[data-cmpgo]').click();
    const cols = document.querySelectorAll('.iv-cmpcol');
    expect(cols.length).toBe(2);
    for (const col of cols) {
      expect(col.textContent).toContain('Body');
      expect(col.textContent).toContain('Mind');
      expect(col.textContent).toContain('TSS');
    }
  });

  it('back returns to the picker with the selection intact; close removes the overlay', () => {
    open();
    checkboxes()[0].click();
    checkboxes().find(c => !c.checked).click();
    document.querySelector('[data-cmpgo]').click();
    document.querySelector('[data-cmpback]').click();
    expect(document.querySelectorAll('[data-cmpsel]:checked').length).toBe(2);
    document.querySelector('[data-cmpclose]').click();
    expect(document.querySelector('.iv-overlay')).toBeNull();
  });

  it('filters compose and the selection survives filter changes', () => {
    open();
    checkboxes()[0].click();
    const sportSel = document.querySelector('[data-cmpf="sport"]');
    sportSel.value = 'bike';
    sportSel.dispatchEvent(new Event('change', { bubbles: true }));
    const rows = [...document.querySelectorAll('.iv-picker tr')].slice(1);
    expect(rows.length).toBeGreaterThan(0);
    // selection made before filtering still counts toward the threshold
    expect(document.querySelector('[data-cmpgo]').textContent).toContain('(1)');
  });

  it('sessions without power omit the row instead of showing blanks', () => {
    open();
    // pick two run sessions (runs never carry power in the synthetic data)
    const sportSel = document.querySelector('[data-cmpf="sport"]');
    sportSel.value = 'run';
    sportSel.dispatchEvent(new Event('change', { bubbles: true }));
    const boxes = [...document.querySelectorAll('[data-cmpsel]')];
    boxes[0].click();
    [...document.querySelectorAll('[data-cmpsel]')].find(c => !c.checked).click();
    document.querySelector('[data-cmpgo]').click();
    for (const col of document.querySelectorAll('.iv-cmpcol')) {
      expect(col.textContent).not.toContain('Avg power');
    }
  });
});

describe('Favorites drag-reorder (exported drop handler)', () => {
  let handleFavoriteDrop;
  const favIds  = () => [...document.querySelectorAll('.iv-railitem.fav')].map(b => b.dataset.jump);
  const feedIds = () => [...document.querySelectorAll('.iv-feed .iv-panel')].map(p => p.dataset.panel);

  beforeEach(async () => {
    ({ handleFavoriteDrop } = await import('../public/js/infoview.js'));
    renderInformation();
  });

  it('dropping a favorite onto another favorite reorders rail, feed, and storage', () => {
    // default order: ffnow, load, bodymind, sleep
    expect(handleFavoriteDrop('sleep', 'ffnow')).toBe('reorder');
    expect(favIds()).toEqual(['sleep', 'ffnow', 'load', 'bodymind']);
    expect(feedIds().slice(0, 4)).toEqual(['sleep', 'ffnow', 'load', 'bodymind']);
    expect(JSON.parse(localStorage.getItem('bh_info_layout')).favorites)
      .toEqual(['sleep', 'ffnow', 'load', 'bodymind']);
  });

  it('drops outside the ★ group bounce: family targets, non-favorite drags, self-drops', () => {
    const before = favIds();
    expect(handleFavoriteDrop('sleep', 'race')).toBe('bounce');   // target not a favorite
    expect(handleFavoriteDrop('race', 'sleep')).toBe('bounce');   // dragged id not a favorite
    expect(handleFavoriteDrop('sleep', 'sleep')).toBe('bounce');  // self-drop
    expect(favIds()).toEqual(before);
    expect(localStorage.getItem('bh_info_layout')).toBeNull();    // nothing was written
  });

  it('the new order survives a reload', async () => {
    handleFavoriteDrop('bodymind', 'ffnow');
    vi.resetModules();
    document.body.innerHTML = `<div id="information-view"></div>`;
    const fresh = await import('../public/js/infoview.js');
    fresh.renderInformation();
    expect(favIds()).toEqual(['bodymind', 'ffnow', 'load', 'sleep']);
  });
});
