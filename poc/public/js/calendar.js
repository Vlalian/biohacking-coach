import { showFeedbackPrompt } from './feedback.js';
import { sessionsForDay, updateSession, SESSION_DEFAULTS } from './store.js';
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
};

function getDateKey(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

// The day's rendered session: first non-Rest entity by dayOrder.
// (Rest entities exist in the store but render in a later slice.)
function primarySession(dateKey) {
  return sessionsForDay(dateKey).find(s => s.type !== 'Rest') || null;
}

function decorateCell(cell, session, dateKey, isPast, isFxConst, isPlanDay, gridIdx) {
  if (session) {
    cell.classList.add('has-session');
    cell.appendChild(makeDot(session));
  }
  if (isFxConst) {
    const dot = document.createElement('div');
    dot.className = 'session-dot constraint';
    cell.appendChild(dot);
    if (!session) cell.classList.add('has-session');
  }
  if (isPlanDay) {
    const dot = document.createElement('div');
    dot.className = 'session-dot planning';
    cell.appendChild(dot);
    if (!session && !isFxConst) cell.classList.add('has-session');
  }
  if (session || isPlanDay) {
    cell.onclick = () => expandDay(dateKey, session, isPast, isPlanDay, gridIdx, cell);
  }
}

let expandedDateKey = null;
let selectedCell    = null;
let displayOffset   = 0;

function selectCell(cell) {
  if (selectedCell) selectedCell.classList.remove('selected');
  selectedCell = cell;
  if (cell) cell.classList.add('selected');
}

export function navigateMonth(delta) {
  displayOffset += delta;
  expandedDateKey = null;
  selectCell(null);
  render();
}

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

// dateKey: 'YYYY-MM-DD', session: entity or null, gridIdx: 0-based grid position
function expandDay(dateKey, session, isPast, isPlanDay, gridIdx, cellEl) {
  document.querySelector('.cal-expansion')?.remove();
  if (expandedDateKey === dateKey) {
    expandedDateKey = null;
    selectCell(null);
    return;
  }
  expandedDateKey = dateKey;
  selectCell(cellEl);

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
      expandedDateKey = null;
      selectCell(null);
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

  // ── Position after the row ──────────────────────────────────────────────────
  const rowIdx    = Math.floor(gridIdx / 7);
  const targetPos = (rowIdx + 1) * 7 - 1;
  const siblings  = [...document.getElementById('calGrid').children].slice(7);
  const anchor    = siblings[Math.min(targetPos, siblings.length - 1)];
  anchor.after(exp);
}

export function render() {
  const phase = document.getElementById('phase')?.value || 'Base Building';
  const narEl = document.getElementById('tp-narrative');
  if (narEl) narEl.textContent = (t('phaseNarratives') || {})[phase] || '';

  const now        = new Date();
  const todayYear  = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDate  = now.getDate();
  const todayObj   = new Date(todayYear, todayMonth, todayDate);

  const display     = new Date(todayYear, todayMonth + displayOffset, 1);
  const year        = display.getFullYear();
  const month       = display.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (display.getDay() + 6) % 7;

  document.getElementById('tp-month-label').textContent = t('months')[month] + ' ' + year;

  const profile          = getProfile();
  const fixedConstraints = profile?.fixedConstraints || window._fixedConstraints || [];
  const planningDay      = (profile?.weeklySessionDay && profile.weeklySessionDay !== 'Flexible')
                           ? profile.weeklySessionDay : null;

  expandedDateKey = null;
  selectedCell    = null;
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  t('dow').forEach(label => {
    const h = document.createElement('div');
    h.className   = 'cal-dow';
    h.textContent = label;
    grid.appendChild(h);
  });

  for (let i = 0; i < startOffset; i++) {
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'cal-day' }));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj   = new Date(year, month, d);
    const dateKey   = getDateKey(dateObj);
    const isPast    = dateObj < todayObj;
    const isToday   = dateObj.getTime() === todayObj.getTime();
    const dayOfWeek = DOW_FULL[dateObj.getDay()];
    const isFxConst = fixedConstraints.includes(dayOfWeek);
    const isPlanDay = !!(planningDay && dayOfWeek === planningDay && !isPast);

    const cell = document.createElement('div');
    cell.className = 'cal-day' + (isToday ? ' today' : '') + (isPast ? ' past' : '');

    const num = document.createElement('div');
    num.className   = 'cal-day-num';
    num.textContent = d;
    cell.appendChild(num);

    // Only real sessions appear — entities from the store, nothing invented.
    const session = primarySession(dateKey);

    decorateCell(cell, session, dateKey, isPast, isFxConst, isPlanDay, startOffset + d - 1);
    grid.appendChild(cell);
  }

  const total     = startOffset + daysInMonth;
  const remainder = total % 7;
  if (remainder > 0) {
    for (let i = 1; i <= 7 - remainder; i++) {
      const cell      = document.createElement('div');
      cell.className  = 'cal-day overflow-month';
      const dateObj   = new Date(year, month + 1, i);
      const dateKey   = getDateKey(dateObj);
      const dayOfWeek = DOW_FULL[dateObj.getDay()];
      const isFxConst = fixedConstraints.includes(dayOfWeek);
      const isPlanDay = !!(planningDay && dayOfWeek === planningDay);

      const num = document.createElement('div');
      num.className   = 'cal-day-num';
      num.textContent = i;
      cell.appendChild(num);

      const session = primarySession(dateKey);

      decorateCell(cell, session, dateKey, false, isFxConst, isPlanDay, startOffset + daysInMonth + i - 1);
      grid.appendChild(cell);
    }
  }
}
