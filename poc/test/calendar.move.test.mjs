// @vitest-environment jsdom
// DOM-level Session Move tests through the exported drop handler.
// The pointer gesture itself is verified manually in the browser.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSession, updateSession, getSession } from '../public/js/store.js';

let render, handleDrop;

// Fixed clock: Wednesday 2026-07-15 — the whole week sits in the July view.
const TODAY    = '2026-07-15';
const THIS_TUE = '2026-07-14';
const THIS_THU = '2026-07-16';
const THIS_SAT = '2026-07-18';

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TODAY + 'T10:00:00'));
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = `
    <select id="phase"><option value="Base Building" selected>Base Building</option></select>
    <div id="tp-narrative"></div>
    <span id="tp-month-label"></span>
    <button id="tpExpandAll"></button>
    <div id="calGrid"></div>
  `;
  ({ render, handleDrop } = await import('../public/js/calendar.js'));
});

afterEach(() => vi.useRealTimers());

function expandWeekOf(dateKey) {
  document.querySelector(`#calGrid .cal-day[data-date="${dateKey}"]`).click();
}

function blockIn(dayKey, sessionId) {
  return document.querySelector(`.week-exp-day[data-day="${dayKey}"] .session-block[data-session-id="${sessionId}"]`);
}

describe('handleDrop — within-week Session Move', () => {
  it('moves a planned block to another day of the week and re-renders it there', () => {
    const s = createSession({ dateKey: THIS_THU, type: 'Endurance', origin: 'coach' });
    render();
    expandWeekOf(THIS_THU);
    expect(handleDrop(s.id, THIS_SAT)).toBe('move');
    expect(blockIn(THIS_SAT, s.id)).not.toBeNull();
    expect(blockIn(THIS_THU, s.id)).toBeNull();
    const dot = document.querySelector(`#calGrid .cal-day[data-date="${THIS_SAT}"] .dots-row .session-dot`);
    expect(dot).not.toBeNull();
  });

  it('a skipped block revives on move: outline styling on the new day', () => {
    const s = createSession({ dateKey: THIS_THU, type: 'Tempo', origin: 'coach' });
    updateSession(s.id, { status: 'skipped' });
    render();
    expandWeekOf(THIS_THU);
    handleDrop(s.id, THIS_SAT);
    expect(blockIn(THIS_SAT, s.id).classList.contains('outline')).toBe(true);
  });

  it('a drop on a past day bounces: block stays where it was', () => {
    const s = createSession({ dateKey: THIS_THU, type: 'Endurance', origin: 'coach' });
    render();
    expandWeekOf(THIS_THU);
    expect(handleDrop(s.id, THIS_TUE)).toBe('bounce');
    expect(blockIn(THIS_THU, s.id)).not.toBeNull();
    expect(getSession(s.id).dateKey).toBe(THIS_THU);
  });

  it('a drop toward another week bounces', () => {
    const s = createSession({ dateKey: THIS_THU, type: 'Endurance', origin: 'coach' });
    render();
    expandWeekOf(THIS_THU);
    expect(handleDrop(s.id, '2026-07-20')).toBe('bounce');
    expect(getSession(s.id).dateKey).toBe(THIS_THU);
  });

  it('a completed block is frozen', () => {
    const s = createSession({ dateKey: THIS_THU, type: 'Endurance', origin: 'coach' });
    updateSession(s.id, { status: 'completed', feedback: { body: 5, mind: 5, comment: '' } });
    render();
    expandWeekOf(THIS_THU);
    expect(handleDrop(s.id, THIS_SAT)).toBe('frozen');
    expect(getSession(s.id).dateKey).toBe(THIS_THU);
  });

  it('two trainings coexist on the drop day as a Double with both blocks rendered', () => {
    const resident = createSession({ dateKey: THIS_SAT, type: 'Intensity', origin: 'coach' });
    const mover    = createSession({ dateKey: THIS_THU, type: 'Recovery', origin: 'coach' });
    render();
    expandWeekOf(THIS_THU);
    handleDrop(mover.id, THIS_SAT);
    expect(blockIn(THIS_SAT, resident.id)).not.toBeNull();
    expect(blockIn(THIS_SAT, mover.id)).not.toBeNull();
  });
});
