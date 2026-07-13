// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSession, updateSession, getSession, getDateKey } from '../public/js/store.js';

let render;

const todayKey = getDateKey(new Date());
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const todayDow = DOW_FULL[new Date().getDay()];

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = `
    <select id="phase"><option value="Base Building" selected>Base Building</option></select>
    <div id="tp-narrative"></div>
    <span id="tp-month-label"></span>
    <button id="tpExpandAll"></button>
    <div id="calGrid"></div>
  `;
  ({ render } = await import('../public/js/calendar.js'));
});

function expandTodayWeek() {
  document.querySelector(`#calGrid .cal-day[data-date="${todayKey}"]`).click();
}

function blockFor(sessionId) {
  return document.querySelector(`.session-block[data-session-id="${sessionId}"]`);
}

function drawer() {
  return document.getElementById('sessionDrawer');
}

describe('Session Drawer — content per status', () => {
  it('opens from a Session Block with type, planned badge, date, params, and note', () => {
    const s = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach', duration: '90 min', zone: 'Zone 2', note: 'Steady aerobic work.' });
    render();
    expandTodayWeek();
    blockFor(s.id).click();
    const d = drawer();
    expect(d.classList.contains('open')).toBe(true);
    expect(d.textContent).toContain('Endurance');
    expect(d.textContent).toContain('Planned');
    expect(d.textContent).toContain('90 min');
    expect(d.textContent).toContain('Zone 2');
    expect(d.textContent).toContain('Steady aerobic work.');
  });

  it('completed session shows its rating and an Edit action', () => {
    const s = createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    updateSession(s.id, { status: 'completed', feedback: { body: 4, mind: 8, comment: 'nice spin' } });
    render();
    expandTodayWeek();
    blockFor(s.id).click();
    expect(drawer().textContent).toContain('RPE 4');
    expect(drawer().textContent).toContain('RPE 8');
    expect(drawer().textContent).toContain('nice spin');
    expect(drawer().querySelector('.btn-rate')).not.toBeNull();
    expect(drawer().querySelector('.btn-skip')).toBeNull();
  });

  it('skipped session shows undo; unavailable shows undo', () => {
    const s = createSession({ dateKey: todayKey, type: 'Tempo', origin: 'coach' });
    updateSession(s.id, { status: 'skipped' });
    render();
    expandTodayWeek();
    blockFor(s.id).click();
    expect(drawer().querySelector('.btn-undo-skip')).not.toBeNull();

    updateSession(s.id, { status: 'unavailable' });
    render(); // the week stays expanded across re-renders
    blockFor(s.id).click();
    expect(drawer().querySelector('.btn-undo-unavail')).not.toBeNull();
  });

  it('Rest session opens with no rate/skip/unavailable actions', () => {
    const s = createSession({ dateKey: todayKey, type: 'Rest', origin: 'coach' });
    render();
    expandTodayWeek();
    blockFor(s.id).click();
    expect(drawer().textContent).toContain('Rest');
    expect(drawer().querySelector('.btn-rate')).toBeNull();
    expect(drawer().querySelector('.btn-skip')).toBeNull();
    expect(drawer().querySelector('.btn-unavail')).toBeNull();
  });
});

describe('Session Drawer — actions', () => {
  it('skip and undo update the store and the calendar dots', () => {
    const s = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    render();
    expandTodayWeek();
    blockFor(s.id).click();
    drawer().querySelector('.btn-skip').click();
    expect(getSession(s.id).status).toBe('skipped');
    const dot = document.querySelector(`#calGrid .cal-day[data-date="${todayKey}"] .dots-row .session-dot`);
    expect(dot.classList.contains('muted')).toBe(true);
    drawer().querySelector('.btn-undo-skip').click();
    expect(getSession(s.id).status).toBe('planned');
  });

  it('Rate opens the feedback prompt with the session\'s own type; saving lands on that session', () => {
    const s = createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    render();
    expandTodayWeek();
    blockFor(s.id).click();
    drawer().querySelector('.btn-rate').click();
    const modal = document.getElementById('bh-feedback-modal');
    expect(modal.textContent).toContain('Recovery');
    modal.querySelector('[data-dim="body"][data-val="7"]').click();
    modal.querySelector('[data-dim="mind"][data-val="5"]').click();
    modal.querySelector('#bh-fb-save').click();
    expect(getSession(s.id)).toMatchObject({ status: 'completed', feedback: { body: 7, mind: 5 } });
  });

  it('on a multi-session day each block opens its own drawer', () => {
    const a = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    const b = createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    render();
    expandTodayWeek();
    blockFor(a.id).click();
    expect(drawer().textContent).toContain('Endurance');
    blockFor(b.id).click();
    expect(drawer().textContent).toContain('Recovery');
    expect(drawer().textContent).not.toContain('Endurance');
  });

  it('Discuss with Coach dispatches the session context and closes the drawer', () => {
    const s = createSession({ dateKey: todayKey, type: 'Tempo', origin: 'coach' });
    render();
    expandTodayWeek();
    blockFor(s.id).click();
    let detail = null;
    document.addEventListener('calendar:sessionSelected', e => { detail = e.detail; }, { once: true });
    drawer().querySelector('.btn-discuss').click();
    expect(detail).toMatchObject({ type: 'Tempo', status: 'planned' });
    expect(drawer().classList.contains('open')).toBe(false);
  });

  it('tapping outside (overlay) closes the drawer', () => {
    const s = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    render();
    expandTodayWeek();
    blockFor(s.id).click();
    document.getElementById('sessionDrawerOverlay').click();
    expect(drawer().classList.contains('open')).toBe(false);
  });
});

describe('Session Drawer — planning day CTA', () => {
  it('the planning-day marker opens the drawer with the Weekly Session CTA', () => {
    localStorage.setItem('bh_athlete_profile', JSON.stringify({ weeklySessionDay: todayDow }));
    window.switchView = vi.fn();
    window.startWeeklySession = vi.fn();
    render();
    expandTodayWeek();
    document.querySelector('.planning-marker').click();
    const cta = drawer().querySelector('.btn-plan-week');
    expect(cta).not.toBeNull();
    expect(drawer().textContent).toContain('Weekly Planning');
    vi.useFakeTimers();
    cta.click();
    vi.runAllTimers();
    vi.useRealTimers();
    expect(window.switchView).toHaveBeenCalledWith('coach');
    expect(window.startWeeklySession).toHaveBeenCalled();
    expect(drawer().classList.contains('open')).toBe(false);
  });
});

describe('inline expansion is gone', () => {
  it('no .cal-expansion appears anywhere', () => {
    const s = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    render();
    expandTodayWeek();
    blockFor(s.id).click();
    expect(document.querySelector('.cal-expansion')).toBeNull();
  });
});
