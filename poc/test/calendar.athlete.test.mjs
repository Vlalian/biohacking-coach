// @vitest-environment jsdom
// Athlete Sessions: the "+" affordance, drawer create/edit mode, retro-log.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSession, getSession, allSessions } from '../public/js/store.js';

let render;

// Fixed clock: Wednesday 2026-07-15.
const TODAY     = '2026-07-15';
const THIS_TUE  = '2026-07-14'; // past day, current week
const THIS_SAT  = '2026-07-18';
const LAST_WED  = '2026-07-08'; // past week

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
  ({ render } = await import('../public/js/calendar.js'));
});

afterEach(() => vi.useRealTimers());

function expandWeekOf(dateKey) {
  document.querySelector(`#calGrid .cal-day[data-date="${dateKey}"]`).click();
}

function addButtonFor(dayKey) {
  return document.querySelector(`.week-exp-day[data-day="${dayKey}"] .day-add`);
}

function drawer() {
  return document.getElementById('sessionDrawer');
}

describe('"+" affordance', () => {
  it('appears on today, future days, and past days (retro-log)', () => {
    render();
    expandWeekOf(TODAY);
    expect(addButtonFor(TODAY)).not.toBeNull();
    expect(addButtonFor(THIS_SAT)).not.toBeNull();
    expect(addButtonFor(THIS_TUE)).not.toBeNull();
  });

  it('opens the drawer create form with all three athlete types', () => {
    render();
    expandWeekOf(TODAY);
    addButtonFor(THIS_SAT).click();
    const types = [...drawer().querySelectorAll('[data-type]')].map(b => b.dataset.type);
    expect(types).toEqual(['Mobility', 'Strength', 'Other']);
  });

  it('on a Rest day the form offers only non-training types, toggle locked', () => {
    createSession({ dateKey: THIS_SAT, type: 'Rest', origin: 'coach' });
    render();
    expandWeekOf(TODAY);
    addButtonFor(THIS_SAT).click();
    const types = [...drawer().querySelectorAll('[data-type]')].map(b => b.dataset.type);
    expect(types).toEqual(['Mobility', 'Other']);
    const toggle = drawer().querySelector('#sd-training-toggle');
    expect(toggle.disabled).toBe(true);
    // even after selecting Other, the toggle stays locked not-training
    drawer().querySelector('[data-type="Other"]').click();
    expect(drawer().querySelector('#sd-training-toggle').disabled).toBe(true);
  });
});

describe('creating Athlete Sessions', () => {
  it('creates a planned Strength session rendered as a block on the day', () => {
    render();
    expandWeekOf(TODAY);
    addButtonFor(THIS_SAT).click();
    drawer().querySelector('[data-type="Strength"]').click();
    drawer().querySelector('#sd-save').click();
    const created = allSessions().find(s => s.origin === 'athlete');
    expect(created).toMatchObject({ type: 'Strength', status: 'planned', isTraining: true, dateKey: THIS_SAT });
    expect(document.querySelector(`.session-block[data-session-id="${created.id}"]`)).not.toBeNull();
  });

  it('Other takes its toggle: switched on, the session counts as training', () => {
    render();
    expandWeekOf(TODAY);
    addButtonFor(THIS_SAT).click();
    drawer().querySelector('[data-type="Other"]').click();
    drawer().querySelector('#sd-training-toggle').click(); // not-training → training
    drawer().querySelector('#sd-title').value = 'Yoga';
    drawer().querySelector('#sd-save').click();
    const created = allSessions().find(s => s.origin === 'athlete');
    expect(created).toMatchObject({ type: 'Other', isTraining: true, title: 'Yoga' });
    expect(document.querySelector(`.session-block[data-session-id="${created.id}"]`).textContent).toContain('Yoga');
  });

  it('a non-training session created on a Rest day coexists with the Rest', () => {
    createSession({ dateKey: THIS_SAT, type: 'Rest', origin: 'coach' });
    render();
    expandWeekOf(TODAY);
    addButtonFor(THIS_SAT).click();
    drawer().querySelector('#sd-save').click(); // Mobility preselected
    const created = allSessions().find(s => s.origin === 'athlete');
    expect(created).toMatchObject({ type: 'Mobility', status: 'planned', parked: false, dateKey: THIS_SAT });
  });
});

describe('editing and deleting', () => {
  function createAthleteToday() {
    render();
    expandWeekOf(TODAY);
    addButtonFor(THIS_SAT).click();
    drawer().querySelector('[data-type="Strength"]').click();
    drawer().querySelector('#sd-save').click();
    return allSessions().find(s => s.origin === 'athlete');
  }

  it('athlete sessions are editable and deletable in the drawer; coach sessions are neither', () => {
    const coach = createSession({ dateKey: TODAY, type: 'Endurance', origin: 'coach' });
    const mine  = createAthleteToday();
    // drawer is already showing the created athlete session
    expect(drawer().querySelector('.btn-edit')).not.toBeNull();
    expect(drawer().querySelector('.btn-delete-session')).not.toBeNull();
    document.querySelector(`.session-block[data-session-id="${coach.id}"]`).click();
    expect(drawer().querySelector('.btn-edit')).toBeNull();
    expect(drawer().querySelector('.btn-delete-session')).toBeNull();
  });

  it('editing updates the entity and the block label', () => {
    const mine = createAthleteToday();
    drawer().querySelector('.btn-edit').click();
    drawer().querySelector('#sd-title').value = 'Heavy squats';
    drawer().querySelector('#sd-save').click();
    expect(getSession(mine.id).title).toBe('Heavy squats');
    expect(document.querySelector(`.session-block[data-session-id="${mine.id}"]`).textContent).toContain('Heavy squats');
  });

  it('deleting removes the entity and its block', () => {
    const mine = createAthleteToday();
    drawer().querySelector('.btn-delete-session').click();
    expect(getSession(mine.id)).toBeNull();
    expect(document.querySelector(`.session-block[data-session-id="${mine.id}"]`)).toBeNull();
  });
});

describe('retro-log', () => {
  it('"+" on a past day creates a completed session and opens the rating prompt immediately', () => {
    render();
    expandWeekOf(TODAY);
    addButtonFor(THIS_TUE).click();
    drawer().querySelector('[data-type="Strength"]').click();
    drawer().querySelector('#sd-save').click();
    const created = allSessions().find(s => s.origin === 'athlete');
    expect(created.status).toBe('completed');
    const modal = document.getElementById('bh-feedback-modal');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('Strength');
    expect(drawer().classList.contains('open')).toBe(false);
  });

  it('"+" reaches past weeks, but existing sessions there stay frozen (no edit/delete)', () => {
    const old = createSession({ dateKey: LAST_WED, type: 'Strength', origin: 'athlete' });
    render();
    expandWeekOf(LAST_WED);
    expect(addButtonFor(LAST_WED)).not.toBeNull();
    document.querySelector(`.session-block[data-session-id="${old.id}"]`).click();
    expect(drawer().querySelector('.btn-edit')).toBeNull();
    expect(drawer().querySelector('.btn-delete-session')).toBeNull();
  });
});

describe('review fix — dismissed retro-log rating', () => {
  it('a completed-but-unrated session reads Completed, offers Rate, and cannot be skipped', () => {
    render();
    expandWeekOf(TODAY);
    addButtonFor(THIS_TUE).click();
    drawer().querySelector('[data-type="Strength"]').click();
    drawer().querySelector('#sd-save').click();
    // dismiss the rating prompt instead of saving it
    document.querySelector('#bh-fb-skip').click();
    const created = allSessions().find(s => s.origin === 'athlete');
    expect(created).toMatchObject({ status: 'completed', feedback: null });

    document.querySelector(`.session-block[data-session-id="${created.id}"]`).click();
    expect(drawer().textContent).toContain('Completed');
    expect(drawer().querySelector('.btn-rate')).not.toBeNull();
    expect(drawer().querySelector('.btn-skip')).toBeNull();
    expect(drawer().querySelector('.btn-unavail')).toBeNull();
  });
});
