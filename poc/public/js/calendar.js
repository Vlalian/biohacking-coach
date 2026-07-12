import { showFeedbackPrompt } from './feedback.js';
import { sessionsForDay, updateSession, weekStartOf, SESSION_DEFAULTS } from './store.js';
import { t } from './translations.js';

const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getProfile() {
  try { return JSON.parse(localStorage.getItem('bh_athlete_profile') || 'null'); } catch { return null; }
}

const SESSION_COLORS = {
  Endurance: '#4a90d9',
  Intensity: '#e05555',
  Tempo:     '#c9a96e',
  Recovery:  '#6db36d',
  Rest:      '#8a8a8a',
};

function getDateKey(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

// ── View state ────────────────────────────────────────────────────────────────

const expandedWeeks = new Set(); // week-start dateKeys of Expanded Weeks
let visibleWeekKeys = [];        // week keys of the displayed month grid
let expandedPanelKey = null;     // inline detail panel identity (bridge until the Session Drawer)
let displayOffset    = 0;

export function navigateMonth(delta) {
  displayOffset += delta;
  expandedPanelKey = null;
  render();
}

function toggleWeek(weekKey) {
  if (expandedWeeks.has(weekKey)) expandedWeeks.delete(weekKey);
  else expandedWeeks.add(weekKey);
  expandedPanelKey = null;
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

// ── Session Blocks (Expanded Week) ────────────────────────────────────────────

function makeBlock(session, slot, anchorEl) {
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

  block.addEventListener('click', e => {
    e.stopPropagation();
    openDayPanel(slot.dateKey, session, slot.isPast === true, false, anchorEl);
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
          openDayPanel(slot.dateKey, null, false, true, exp);
        });
        col.appendChild(marker);
      }
      sessionsForDay(slot.dateKey).forEach(s => col.appendChild(makeBlock(s, slot, exp)));
    }
    exp.appendChild(col);
  });
  return exp;
}

// ── Inline day panel ──────────────────────────────────────────────────────────
// Temporary bridge: session detail and actions until the Session Drawer lands.

function buildFeedbackDisplay(fb) {
  if (!fb) return '';
  const body    = fb.body ? `RPE ${fb.body}` : '—';
  const mind    = fb.mind ? `RPE ${fb.mind}` : '—';
  const comment = fb.comment
    ? `<div style="margin-top:8px;font-size:12px;color:#a0a0a0;line-height:1.5;">"${fb.comment}"</div>`
    : '';
  return `
    <div style="margin:12px 0 8px;padding:10px 12px;background:#141414;border-radius:8px;display:flex;gap:16px;align-items:center;">
      <span style="font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.1em;">Body</span>
      <span style="font-size:13px;font-weight:700;color:#e2e2e2;">${body}</span>
      <span style="font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.1em;margin-left:8px;">Mind</span>
      <span style="font-size:13px;font-weight:700;color:#e2e2e2;">${mind}</span>
    </div>
    ${comment}`;
}

function openDayPanel(dateKey, session, isPast, isPlanDay, anchorEl) {
  document.querySelector('.cal-expansion')?.remove();
  const panelKey = `${dateKey}:${session?.id || 'plan'}`;
  if (expandedPanelKey === panelKey) {
    expandedPanelKey = null;
    return;
  }
  expandedPanelKey = panelKey;

  const dateObj  = new Date(dateKey + 'T00:00:00');
  const dayLabel = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const exp = document.createElement('div');
  exp.className = 'cal-expansion';

  // ── Planning day panel (always first) ──────────────────────────────────────
  if (isPlanDay) {
    const planDiv = document.createElement('div');
    planDiv.style.cssText = 'margin-bottom:' + (session ? '12px' : '0') + ';';
    planDiv.innerHTML = `
      <div style="font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#c9a96e;margin-bottom:6px;">${t('planningDayTitle')}</div>
      <div style="font-size:13px;color:#a0a0a0;margin-bottom:12px;">${t('planningDayDesc')}</div>
      <button class="btn-plan-week" style="width:100%;padding:10px;background:#c9a96e;color:#000;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">${t('startWeeklySession')}</button>`;
    exp.appendChild(planDiv);
    planDiv.querySelector('.btn-plan-week').addEventListener('click', () => {
      document.querySelector('.cal-expansion')?.remove();
      expandedPanelKey = null;
      window.switchView('coach');
      setTimeout(() => window.startWeeklySession(), 50);
    });
  }

  // ── Session panel ───────────────────────────────────────────────────────────
  if (session) {
    const defaults = SESSION_DEFAULTS[session.type] || {};
    const defs = {
      duration: session.duration || defaults.duration || '',
      zone:     session.zone     || defaults.zone     || '',
      note:     session.note     || defaults.note     || '',
    };
    const color = SESSION_COLORS[session.type] || '#888';

    const isSkipped     = session.status === 'skipped';
    const isUnavailable = session.status === 'unavailable';
    const hasRated      = session.status === 'completed' && !!session.feedback;
    const todayKey      = getDateKey(new Date());
    const isToday       = dateKey === todayKey;
    const canRate       = !isSkipped && !isUnavailable && (isPast || isToday);
    const canSkip       = !isSkipped && !isUnavailable && !hasRated;
    const canMarkUnavail = !isUnavailable && !isSkipped && !hasRated && !isPast;

    const status = session.status;
    const label  = isUnavailable ? t('statusUnavailable') : isSkipped ? t('statusSkipped') : (hasRated ? t('statusCompleted') : t('statusPlanned'));

    const sessionCtx = { type: session.type, dayLabel, duration: defs.duration, zone: defs.zone, note: defs.note, status };

    const sessionDiv = document.createElement('div');
    if (isPlanDay) sessionDiv.style.cssText = 'border-top:1px solid #1e1e1e;padding-top:14px;';
    sessionDiv.innerHTML = `
      <div class="cal-exp-row">
        <span class="cal-exp-type" style="color:${color}">${session.type}</span>
        <span class="cal-exp-badge ${status}">${label}</span>
      </div>
      <div class="cal-exp-meta">${defs.duration} &nbsp;·&nbsp; ${defs.zone}</div>
      <p class="cal-exp-note">${defs.note}</p>
      ${hasRated ? buildFeedbackDisplay(session.feedback) : ''}
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        ${canRate       ? `<button class="btn-rate"        style="flex:1;min-width:90px;padding:8px 0;background:transparent;border:1px solid #282828;border-radius:6px;color:#6b6b6b;font-size:12px;font-weight:600;cursor:pointer;">${hasRated ? t('rateSessionEdit') : t('rateSession')}</button>` : ''}
        ${canSkip       ? `<button class="btn-skip"        style="flex:1;min-width:90px;padding:8px 0;background:transparent;border:1px solid #282828;border-radius:6px;color:#6b6b6b;font-size:12px;font-weight:600;cursor:pointer;">${t('markSkipped')}</button>` : ''}
        ${isSkipped     ? `<button class="btn-undo-skip"   style="flex:1;min-width:90px;padding:8px 0;background:transparent;border:1px solid #282828;border-radius:6px;color:#6b6b6b;font-size:12px;font-weight:600;cursor:pointer;">${t('undoSkipped')}</button>` : ''}
        ${canMarkUnavail? `<button class="btn-unavail"     style="flex:1;min-width:90px;padding:8px 0;background:transparent;border:1px solid #553333;border-radius:6px;color:#8b5050;font-size:12px;font-weight:600;cursor:pointer;">${t('markUnavailable')}</button>` : ''}
        ${isUnavailable ? `<button class="btn-undo-unavail"style="flex:1;min-width:90px;padding:8px 0;background:transparent;border:1px solid #282828;border-radius:6px;color:#6b6b6b;font-size:12px;font-weight:600;cursor:pointer;">${t('undoUnavailable')}</button>` : ''}
        <button class="btn-discuss" style="flex:2;min-width:120px;padding:8px 0;background:#c9a96e;color:#000;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;opacity:0.9;">${t('discussCoach')}</button>
      </div>`;
    exp.appendChild(sessionDiv);

    sessionDiv.querySelector('.btn-discuss').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('calendar:sessionSelected', { detail: sessionCtx }));
    });
    if (canRate)        sessionDiv.querySelector('.btn-rate').addEventListener('click',        () => showFeedbackPrompt(dateKey, session.type, () => render(), { preload: hasRated }));
    if (canSkip)        sessionDiv.querySelector('.btn-skip').addEventListener('click',        () => { updateSession(session.id, { status: 'skipped' }); render(); });
    if (isSkipped)      sessionDiv.querySelector('.btn-undo-skip').addEventListener('click',   () => { updateSession(session.id, { status: 'planned' }); render(); });
    if (canMarkUnavail) sessionDiv.querySelector('.btn-unavail').addEventListener('click',     () => { updateSession(session.id, { status: 'unavailable' }); render(); });
    if (isUnavailable)  sessionDiv.querySelector('.btn-undo-unavail').addEventListener('click',() => { updateSession(session.id, { status: 'planned' }); render(); });
  }

  anchorEl.after(exp);
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
    expandedPanelKey = null;
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

  expandedPanelKey = null;
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
