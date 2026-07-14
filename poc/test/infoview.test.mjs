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
  it('rail groups match panel families and contain only available panels', async () => {
    const { setDataState } = await import('../public/js/infoview.js');
    renderInformation();
    const groups = [...document.querySelectorAll('.iv-railgroup')].map(g => g.dataset.family);
    expect(groups).toEqual(['infoFamilyFormLoad', 'infoFamilyBodyMind', 'infoFamilyVolume', 'infoFamilyPeaks']);
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
