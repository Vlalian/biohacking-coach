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
    expect(document.querySelector('.iv-ptitle').textContent).toBe('Krop & Hoved-feedback');
    expect(document.querySelector('#information-view h1').textContent).toBe('Information');
  });

  it('is idempotent — re-render does not duplicate panels', () => {
    renderInformation();
    const first = document.querySelectorAll('.iv-panel').length;
    renderInformation();
    expect(document.querySelectorAll('.iv-panel').length).toBe(first);
  });
});
