import { sessionsForDay, weekStartOf, getDateKey as storeDateKey, SESSION_COLORS } from './store.js';
import { openSessionDrawer, openPlanningDrawer } from './drawer.js';
import { applyMove } from './moves.js';
import { isFrozen } from './rules.js';
import { t } from './translations.js';

const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getProfile() {
  try { return JSON.parse(localStorage.getItem('bh_athlete_profile') || 'null'); } catch { return null; }
}

function getDateKey(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

// ── View state ────────────────────────────────────────────────────────────────

const expandedWeeks = new Set(); // week-start dateKeys of Expanded Weeks
let visibleWeekKeys = [];        // week keys of the displayed month grid
let displayOffset   = 0;

export function navigateMonth(delta) {
  displayOffset += delta;
  render();
}

function toggleWeek(weekKey) {
  if (expandedWeeks.has(weekKey)) expandedWeeks.delete(weekKey);
  else expandedWeeks.add(weekKey);
  render();
}

// ── Collapsed day dots (reconciled multi-dot spec) ────────────────────────────

function makeDot(session) {
  const dot   = document.createElement('div');
  const color = SESSION_COLORS[session.type] || '#888';
  if (session.status === 'unavailable') {
    dot.className = 'session-dot unavailable';
  } else if (session.status === 'skipped') {
    dot.className = 'session-dot muted';
  } else if (session.status === 'completed') {
    // Solid = the athlete actually rated the session. A past plan day without
    // feedback stays an outline — it was planned, not proven done.
    dot.className = 'session-dot solid';
    dot.style.background = color;
  } else {
    dot.className = 'session-dot outline';
    dot.style.borderColor = color;
  }
  return dot;
}

// Up to 5 dots side by side; six or more sessions show 4 dots + a +N overflow.
function renderDots(cell, sessions) {
  if (sessions.length === 0) return;
  const row = document.createElement('div');
  row.className = 'dots-row';
  const shown = sessions.length > 5 ? sessions.slice(0, 4) : sessions;
  shown.forEach(s => row.appendChild(makeDot(s)));
  if (sessions.length > 5) {
    const more = document.createElement('span');
    more.className   = 'dot-overflow';
    more.textContent = `+${sessions.length - 4}`;
    row.appendChild(more);
  }
  cell.appendChild(row);
}

// ── Session Move — pointer-event drag ─────────────────────────────────────────
// Drop targets: expanded-week day columns and collapsed day cells. Drops call
// handleDrop; invalid drops bounce silently. The gesture itself is verified
// manually in the browser — tests invoke handleDrop directly.

let drag = null;        // { sessionId, el, startX, startY, active }
let justDragged = false; // suppresses the click that follows a completed drag

// Applies a drop and re-renders on success. Exported for tests and reuse.
export function handleDrop(sessionId, targetDateKey) {
  const verdict = applyMove(sessionId, targetDateKey);
  if (verdict === 'move') render();
  return verdict;
}

function dropTargetAt(x, y) {
  const el  = document.elementFromPoint(x, y);
  const col = el?.closest?.('.week-exp-day[data-day]');
  if (col) return col;
  return el?.closest?.('.cal-day[data-date]') || null;
}

function clearDropHover() {
  document.querySelectorAll('.drop-hover').forEach(el => el.classList.remove('drop-hover'));
}

function onBlockPointerDown(e, session) {
  if (isFrozen(session, storeDateKey(new Date()))) return; // frozen blocks cannot be lifted
  drag = { sessionId: session.id, el: e.currentTarget, startX: e.clientX, startY: e.clientY, active: false };
  e.currentTarget.setPointerCapture?.(e.pointerId);
}

function onBlockPointerMove(e) {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
    drag.active = true;
    drag.el.classList.add('dragging');
  }
  clearDropHover();
  dropTargetAt(e.clientX, e.clientY)?.classList.add('drop-hover');
}

function onBlockPointerUp(e) {
  if (!drag) return;
  const { sessionId, el, active } = drag;
  drag = null;
  clearDropHover();
  el.classList.remove('dragging');
  if (!active) return; // a plain tap — the click handler opens the drawer
  justDragged = true;
  const target = dropTargetAt(e.clientX, e.clientY);
  const dateKey = target?.dataset.day || target?.dataset.date;
  if (dateKey) handleDrop(sessionId, dateKey);
}

// ── Session Blocks (Expanded Week) ────────────────────────────────────────────

function makeBlock(session) {
  const block = document.createElement('div');
  const color = SESSION_COLORS[session.type] || '#888';

  // Style mirrors the dot status language; Rest renders as a muted block.
  let style = 'outline';
  if (session.type === 'Rest' || session.status === 'skipped' || session.status === 'unavailable') style = 'muted';
  else if (session.status === 'completed') style = 'solid';

  block.className = `session-block ${style}`;
  block.dataset.sessionId = session.id;
  block.textContent = session.type === 'Rest' || !session.duration
    ? session.type
    : `${session.type} · ${session.duration}`;

  if (style === 'outline') { block.style.borderColor = color; block.style.color = color; }
  if (style === 'solid')   { block.style.background = color; block.style.color = '#0a0a0a'; }

  block.addEventListener('pointerdown', e => onBlockPointerDown(e, session));
  block.addEventListener('pointermove', onBlockPointerMove);
  block.addEventListener('pointerup',   onBlockPointerUp);
  block.addEventListener('pointercancel', () => { drag?.el.classList.remove('dragging'); drag = null; clearDropHover(); });

  block.addEventListener('click', e => {
    e.stopPropagation();
    if (justDragged) { justDragged = false; return; }
    openSessionDrawer(session.id, { onChange: render });
  });
  return block;
}

function buildWeekExpansion(rowSlots) {
  const exp = document.createElement('div');
  exp.className = 'week-expansion';
  rowSlots.forEach(slot => {
    const col = document.createElement('div');
    col.className = 'week-exp-day';
    if (!slot.blank) {
      col.dataset.day = slot.dateKey;
      if (slot.isPlanDay) {
        const marker = document.createElement('div');
        marker.className   = 'session-block planning-marker';
        marker.textContent = t('planningDayTitle');
        marker.addEventListener('click', e => {
          e.stopPropagation();
          openPlanningDrawer();
        });
        col.appendChild(marker);
      }
      sessionsForDay(slot.dateKey).forEach(s => col.appendChild(makeBlock(s)));
    }
    exp.appendChild(col);
  });
  return exp;
}

// ── Month grid ────────────────────────────────────────────────────────────────

function makeCell(slot, weekKey) {
  const cell = document.createElement('div');
  if (slot.blank) {
    cell.className = 'cal-day';
    cell.onclick   = () => toggleWeek(weekKey);
    return cell;
  }

  cell.className = 'cal-day'
    + (slot.isToday ? ' today' : '')
    + (slot.isPast ? ' past' : '')
    + (slot.overflow ? ' overflow-month' : '');
  cell.dataset.date = slot.dateKey;

  const num = document.createElement('div');
  num.className   = 'cal-day-num';
  num.textContent = slot.dayNum;
  cell.appendChild(num);

  // Only real sessions appear — entities from the store, nothing invented.
  const sessions = sessionsForDay(slot.dateKey);
  renderDots(cell, sessions);

  if (slot.isFxConst) {
    const dot = document.createElement('div');
    dot.className = 'session-dot constraint';
    cell.appendChild(dot);
  }
  if (slot.isPlanDay) {
    const dot = document.createElement('div');
    dot.className = 'session-dot planning';
    cell.appendChild(dot);
  }
  if (sessions.length > 0 || slot.isFxConst || slot.isPlanDay) cell.classList.add('has-session');

  cell.onclick = () => toggleWeek(weekKey);
  return cell;
}

function wireExpandAll() {
  const btn = document.getElementById('tpExpandAll');
  if (!btn) return;
  const allOpen = visibleWeekKeys.length > 0 && visibleWeekKeys.every(k => expandedWeeks.has(k));
  btn.textContent = allOpen ? t('collapseAll') : t('expandAll');
  btn.onclick = () => {
    const open = visibleWeekKeys.every(k => expandedWeeks.has(k));
    visibleWeekKeys.forEach(k => open ? expandedWeeks.delete(k) : expandedWeeks.add(k));
    render();
  };
}

export function render() {
  const phase = document.getElementById('phase')?.value || 'Base Building';
  const narEl = document.getElementById('tp-narrative');
  if (narEl) narEl.textContent = (t('phaseNarratives') || {})[phase] || '';

  const now        = new Date();
  const todayObj   = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const display     = new Date(now.getFullYear(), now.getMonth() + displayOffset, 1);
  const year        = display.getFullYear();
  const month       = display.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (display.getDay() + 6) % 7;

  const monthLabel = document.getElementById('tp-month-label');
  if (monthLabel) monthLabel.textContent = t('months')[month] + ' ' + year;

  const profile          = getProfile();
  const fixedConstraints = profile?.fixedConstraints || window._fixedConstraints || [];
  const planningDay      = (profile?.weeklySessionDay && profile.weeklySessionDay !== 'Flexible')
                           ? profile.weeklySessionDay : null;

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  t('dow').forEach(label => {
    const h = document.createElement('div');
    h.className   = 'cal-dow';
    h.textContent = label;
    grid.appendChild(h);
  });

  // Every grid slot carries its real date; leading previous-month slots stay
  // visually blank but keep their week membership for row toggling.
  const slots = [];
  for (let i = 0; i < startOffset; i++) {
    slots.push({ dateKey: getDateKey(new Date(year, month, 1 - (startOffset - i))), blank: true });
  }
  const pushDay = (dateObj, dayNum, overflow) => {
    const dateKey   = getDateKey(dateObj);
    const dayOfWeek = DOW_FULL[dateObj.getDay()];
    const isPast    = dateObj < todayObj;
    slots.push({
      dateKey, dayNum, overflow,
      isPast,
      isToday:   dateObj.getTime() === todayObj.getTime(),
      isFxConst: fixedConstraints.includes(dayOfWeek),
      isPlanDay: !!(planningDay && dayOfWeek === planningDay && !isPast),
    });
  };
  for (let d = 1; d <= daysInMonth; d++) pushDay(new Date(year, month, d), d, false);
  const remainder = slots.length % 7;
  if (remainder > 0) {
    for (let i = 1; i <= 7 - remainder; i++) pushDay(new Date(year, month + 1, i), i, true);
  }

  visibleWeekKeys = [];
  for (let r = 0; r < slots.length / 7; r++) {
    const rowSlots = slots.slice(r * 7, r * 7 + 7);
    const weekKey  = weekStartOf(rowSlots[0].dateKey);
    visibleWeekKeys.push(weekKey);
    rowSlots.forEach(slot => grid.appendChild(makeCell(slot, weekKey)));
    if (expandedWeeks.has(weekKey)) grid.appendChild(buildWeekExpansion(rowSlots));
  }

  wireExpandAll();
}
