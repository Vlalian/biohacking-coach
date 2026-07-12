// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSession, updateSession, getDateKey, weekStartOf, addDays } from '../public/js/store.js';

let render;

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

const todayKey = getDateKey(new Date());

function cellFor(dateKey) {
  return document.querySelector(`#calGrid .cal-day[data-date="${dateKey}"]`);
}

function expansions() {
  return [...document.querySelectorAll('#calGrid .week-expansion')];
}

// Two dated cells from different week rows of the displayed month.
function twoDifferentWeekCells() {
  const dated = [...document.querySelectorAll('#calGrid .cal-day[data-date]')];
  const byWeek = new Map();
  dated.forEach(c => {
    const wk = weekStartOf(c.dataset.date);
    if (!byWeek.has(wk)) byWeek.set(wk, c);
  });
  return [...byWeek.values()];
}

describe('Expanded Week — toggling', () => {
  it('tapping a week row expands it in place; tapping again collapses', () => {
    createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    render();
    const cell = cellFor(todayKey);
    cell.click();
    expect(expansions()).toHaveLength(1);
    cellFor(todayKey).click();
    expect(expansions()).toHaveLength(0);
  });

  it('several weeks can be expanded at the same time', () => {
    render();
    const [a, b] = twoDifferentWeekCells();
    a.click();
    b.click();
    expect(expansions()).toHaveLength(2);
  });

  it('collapsing one week leaves the other expanded', () => {
    render();
    const [a, b] = twoDifferentWeekCells();
    const aDate = a.dataset.date;
    a.click();
    b.click();
    cellFor(aDate).click();
    expect(expansions()).toHaveLength(1);
  });

  it('header toggle expands all weeks, then collapses all', () => {
    render();
    const weeks = twoDifferentWeekCells().length >= 2; // month grid always has several weeks
    expect(weeks).toBe(true);
    document.getElementById('tpExpandAll').click();
    const total = expansions().length;
    expect(total).toBeGreaterThanOrEqual(4);
    document.getElementById('tpExpandAll').click();
    expect(expansions()).toHaveLength(0);
  });
});

describe('Expanded Week — Session Blocks', () => {
  it('blocks render with status styling for every status, including Rest', () => {
    const planned = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    const done    = createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    updateSession(done.id, { status: 'completed', feedback: { body: 5, mind: 5, comment: '' } });
    const skipped = createSession({ dateKey: todayKey, type: 'Tempo', origin: 'coach' });
    updateSession(skipped.id, { status: 'skipped' });
    createSession({ dateKey: todayKey, type: 'Rest', origin: 'coach' });
    render();
    cellFor(todayKey).click();

    const blocks = [...expansions()[0].querySelectorAll(`[data-day="${todayKey}"] .session-block`)];
    expect(blocks).toHaveLength(4);
    expect(blocks.find(b => b.textContent.includes('Endurance')).classList.contains('outline')).toBe(true);
    expect(blocks.find(b => b.textContent.includes('Recovery')).classList.contains('solid')).toBe(true);
    expect(blocks.find(b => b.textContent.includes('Tempo')).classList.contains('muted')).toBe(true);
    expect(blocks.find(b => b.textContent.includes('Rest')).classList.contains('muted')).toBe(true);
  });

  it('block label carries type and duration', () => {
    createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach', duration: '90 min' });
    render();
    cellFor(todayKey).click();
    const block = expansions()[0].querySelector('.session-block');
    expect(block.textContent).toContain('Endurance');
    expect(block.textContent).toContain('90 min');
  });

  it('a day with multiple sessions shows multiple blocks under its column', () => {
    createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    render();
    cellFor(todayKey).click();
    expect(expansions()[0].querySelectorAll(`[data-day="${todayKey}"] .session-block`)).toHaveLength(2);
  });
});

describe('collapsed day — reconciled multi-dot spec', () => {
  function sessionDots(cell) {
    return [...cell.querySelectorAll('.session-dot')]
      .filter(d => !d.classList.contains('constraint') && !d.classList.contains('planning'));
  }

  it('a day with two sessions shows two dots', () => {
    createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    render();
    expect(sessionDots(cellFor(todayKey))).toHaveLength(2);
  });

  it('per-session dot styling: one solid + one outline on the same day', () => {
    const done = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    updateSession(done.id, { status: 'completed', feedback: { body: 5, mind: 5, comment: '' } });
    createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    render();
    const dots = sessionDots(cellFor(todayKey));
    expect(dots.filter(d => d.classList.contains('solid'))).toHaveLength(1);
    expect(dots.filter(d => d.classList.contains('outline'))).toHaveLength(1);
  });

  it('a day reads complete (all solid) only when every session is rated', () => {
    const a = createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    const b = createSession({ dateKey: todayKey, type: 'Recovery', origin: 'coach' });
    updateSession(a.id, { status: 'completed', feedback: { body: 5, mind: 5, comment: '' } });
    render();
    let dots = sessionDots(cellFor(todayKey));
    expect(dots.every(d => d.classList.contains('solid'))).toBe(false);
    updateSession(b.id, { status: 'completed', feedback: { body: 6, mind: 6, comment: '' } });
    render();
    dots = sessionDots(cellFor(todayKey));
    expect(dots.every(d => d.classList.contains('solid'))).toBe(true);
  });

  it('six sessions render 4 dots + a "+2" overflow indicator', () => {
    for (let i = 0; i < 6; i++) createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    render();
    const cell = cellFor(todayKey);
    expect(sessionDots(cell)).toHaveLength(4);
    expect(cell.querySelector('.dot-overflow').textContent).toBe('+2');
  });

  it('five sessions render five dots and no overflow', () => {
    for (let i = 0; i < 5; i++) createSession({ dateKey: todayKey, type: 'Endurance', origin: 'coach' });
    render();
    const cell = cellFor(todayKey);
    expect(sessionDots(cell)).toHaveLength(5);
    expect(cell.querySelector('.dot-overflow')).toBeNull();
  });

  it('Rest renders as a grey dot on a collapsed day', () => {
    createSession({ dateKey: todayKey, type: 'Rest', origin: 'coach' });
    render();
    expect(sessionDots(cellFor(todayKey))).toHaveLength(1);
  });
});
