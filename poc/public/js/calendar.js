import { getSessionFeedback, setSessionFeedback, deleteSessionFeedback, showFeedbackPrompt } from './feedback.js';
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

const SESSION_DEFAULTS = {
  Endurance: { duration: '90 min', zone: 'Zone 2',   note: 'Aerobic foundation — keep HR conversational and resist the urge to push.' },
  Intensity: { duration: '60 min', zone: 'Zone 4–5', note: 'Hit your intervals hard and recover fully between reps.' },
  Tempo:     { duration: '75 min', zone: 'Zone 3',   note: 'Comfortably hard — you should be able to speak in short sentences.' },
  Recovery:  { duration: '45 min', zone: 'Zone 1',   note: 'Easy movement to flush the legs. No ego today.' },
};


// d = 1-indexed day offset from start of displayed month.
// d > daysInMonth = next-month overflow day (d - daysInMonth = day number in next month).
// skipped: true marks a past session as skipped rather than completed.
const SESSION_DATA = {
  'Early Base Building': [
    { d: 1,  type: 'Endurance' }, { d: 3,  type: 'Recovery'  }, { d: 5,  type: 'Endurance' },
    { d: 8,  type: 'Endurance' }, { d: 10, type: 'Recovery'  }, { d: 12, type: 'Endurance' },
    { d: 14, type: 'Recovery',  skipped: true },
    { d: 15, type: 'Endurance' }, { d: 17, type: 'Recovery'  }, { d: 19, type: 'Endurance' },
    { d: 21, type: 'Recovery'  },
    { d: 22, type: 'Endurance' }, { d: 24, type: 'Recovery'  }, { d: 26, type: 'Endurance' },
    { d: 28, type: 'Recovery'  }, { d: 29, type: 'Endurance' },
    { d: 31, type: 'Recovery'  }, { d: 33, type: 'Endurance' },
  ],
  'Base Building': [
    { d: 1,  type: 'Endurance' }, { d: 2,  type: 'Tempo'     }, { d: 4,  type: 'Endurance' },
    { d: 5,  type: 'Recovery'  }, { d: 6,  type: 'Endurance' },
    { d: 8,  type: 'Endurance' }, { d: 9,  type: 'Tempo'     }, { d: 11, type: 'Endurance' },
    { d: 12, type: 'Recovery'  }, { d: 13, type: 'Endurance', skipped: true },
    { d: 15, type: 'Endurance' }, { d: 16, type: 'Tempo',     skipped: true },
    { d: 18, type: 'Endurance' }, { d: 19, type: 'Recovery'  }, { d: 20, type: 'Endurance' },
    { d: 21, type: 'Recovery'  },
    { d: 22, type: 'Endurance' }, { d: 23, type: 'Tempo'     }, { d: 25, type: 'Endurance' },
    { d: 26, type: 'Recovery'  }, { d: 27, type: 'Endurance' },
    { d: 29, type: 'Endurance' }, { d: 30, type: 'Tempo'     },
    { d: 32, type: 'Endurance' }, { d: 33, type: 'Recovery'  }, { d: 34, type: 'Endurance' },
  ],
  'Build Phase': [
    { d: 1,  type: 'Endurance' }, { d: 2,  type: 'Intensity' }, { d: 3,  type: 'Recovery' },
    { d: 4,  type: 'Tempo'     }, { d: 5,  type: 'Endurance' }, { d: 6,  type: 'Intensity' },
    { d: 8,  type: 'Endurance' }, { d: 9,  type: 'Intensity' }, { d: 10, type: 'Recovery' },
    { d: 11, type: 'Tempo'     }, { d: 12, type: 'Endurance' }, { d: 13, type: 'Intensity', skipped: true },
    { d: 15, type: 'Endurance' }, { d: 16, type: 'Intensity' }, { d: 17, type: 'Recovery' },
    { d: 18, type: 'Tempo'     }, { d: 19, type: 'Endurance' }, { d: 20, type: 'Intensity', skipped: true },
    { d: 21, type: 'Recovery'  },
    { d: 22, type: 'Endurance' }, { d: 23, type: 'Intensity' }, { d: 24, type: 'Recovery' },
    { d: 25, type: 'Tempo'     }, { d: 26, type: 'Endurance' }, { d: 27, type: 'Intensity' },
    { d: 29, type: 'Endurance' }, { d: 30, type: 'Recovery'  },
    { d: 31, type: 'Intensity' }, { d: 32, type: 'Endurance' }, { d: 33, type: 'Recovery' },
    { d: 34, type: 'Tempo'     }, { d: 35, type: 'Endurance' },
  ],
  'Peak Phase': [
    { d: 1,  type: 'Tempo'     }, { d: 2,  type: 'Intensity' }, { d: 3,  type: 'Recovery' },
    { d: 4,  type: 'Intensity' }, { d: 5,  type: 'Endurance' }, { d: 6,  type: 'Tempo'    },
    { d: 8,  type: 'Intensity' }, { d: 9,  type: 'Tempo'     }, { d: 10, type: 'Recovery' },
    { d: 11, type: 'Intensity' }, { d: 12, type: 'Endurance' }, { d: 13, type: 'Tempo',    skipped: true },
    { d: 15, type: 'Intensity' }, { d: 16, type: 'Tempo'     }, { d: 17, type: 'Recovery' },
    { d: 18, type: 'Intensity' }, { d: 19, type: 'Endurance' }, { d: 20, type: 'Intensity', skipped: true },
    { d: 21, type: 'Recovery'  },
    { d: 22, type: 'Intensity' }, { d: 23, type: 'Tempo'     }, { d: 24, type: 'Recovery' },
    { d: 25, type: 'Intensity' }, { d: 26, type: 'Endurance' }, { d: 27, type: 'Tempo'    },
    { d: 29, type: 'Intensity' }, { d: 30, type: 'Recovery'  },
    { d: 31, type: 'Tempo'     }, { d: 32, type: 'Intensity' }, { d: 33, type: 'Endurance' },
    { d: 34, type: 'Recovery'  }, { d: 35, type: 'Intensity' },
  ],
  'Taper': [
    { d: 1,  type: 'Endurance' }, { d: 3,  type: 'Recovery'  }, { d: 4,  type: 'Tempo'    },
    { d: 5,  type: 'Endurance' },
    { d: 8,  type: 'Recovery'  }, { d: 9,  type: 'Endurance' }, { d: 10, type: 'Tempo'    },
    { d: 12, type: 'Recovery'  },
    { d: 15, type: 'Endurance' }, { d: 16, type: 'Tempo',     skipped: true }, { d: 17, type: 'Recovery' },
    { d: 19, type: 'Endurance' },
    { d: 21, type: 'Recovery'  },
    { d: 22, type: 'Endurance' }, { d: 23, type: 'Recovery'  }, { d: 24, type: 'Tempo'    },
    { d: 26, type: 'Endurance' },
    { d: 29, type: 'Recovery'  }, { d: 30, type: 'Endurance' },
    { d: 32, type: 'Recovery'  }, { d: 33, type: 'Endurance' }, { d: 35, type: 'Recovery' },
  ],
  'Recovery': [
    { d: 1,  type: 'Recovery'  }, { d: 3,  type: 'Recovery'  }, { d: 5,  type: 'Endurance' },
    { d: 7,  type: 'Recovery',  skipped: true },
    { d: 8,  type: 'Recovery'  }, { d: 10, type: 'Recovery'  }, { d: 12, type: 'Endurance' },
    { d: 14, type: 'Recovery'  },
    { d: 15, type: 'Recovery'  }, { d: 17, type: 'Recovery'  }, { d: 19, type: 'Endurance' },
    { d: 21, type: 'Recovery'  },
    { d: 22, type: 'Recovery'  }, { d: 24, type: 'Recovery'  }, { d: 26, type: 'Endurance' },
    { d: 28, type: 'Recovery'  }, { d: 29, type: 'Recovery'  },
    { d: 31, type: 'Recovery'  }, { d: 33, type: 'Recovery'  }, { d: 35, type: 'Endurance' },
  ],
  'Return to Training': [
    { d: 2,  type: 'Recovery'  }, { d: 4,  type: 'Endurance' }, { d: 6,  type: 'Recovery' },
    { d: 9,  type: 'Endurance' }, { d: 11, type: 'Recovery'  }, { d: 13, type: 'Endurance', skipped: true },
    { d: 15, type: 'Recovery'  }, { d: 16, type: 'Endurance' }, { d: 18, type: 'Recovery' },
    { d: 20, type: 'Endurance' }, { d: 21, type: 'Recovery'  },
    { d: 22, type: 'Endurance' }, { d: 24, type: 'Recovery'  }, { d: 26, type: 'Endurance' },
    { d: 28, type: 'Recovery'  }, { d: 29, type: 'Endurance' },
    { d: 31, type: 'Recovery'  }, { d: 33, type: 'Endurance' }, { d: 35, type: 'Recovery' },
  ],
  'Off-season Maintenance': [
    { d: 1,  type: 'Endurance' }, { d: 3,  type: 'Recovery'  }, { d: 5,  type: 'Endurance' },
    { d: 7,  type: 'Recovery'  },
    { d: 8,  type: 'Endurance' }, { d: 10, type: 'Tempo',     skipped: true }, { d: 12, type: 'Endurance' },
    { d: 14, type: 'Recovery'  },
    { d: 15, type: 'Endurance' }, { d: 17, type: 'Tempo'     }, { d: 19, type: 'Endurance' },
    { d: 21, type: 'Recovery'  },
    { d: 22, type: 'Endurance' }, { d: 24, type: 'Tempo'     }, { d: 26, type: 'Endurance' },
    { d: 28, type: 'Recovery'  }, { d: 29, type: 'Endurance' },
    { d: 31, type: 'Endurance' }, { d: 33, type: 'Recovery'  }, { d: 35, type: 'Endurance' },
  ],
};

const EMOJIS = ['😫', '😕', '😐', '🙂', '😄'];

const DOW_OFFSETS = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };

function getWeekPlan() {
  try {
    const stored = localStorage.getItem('bh_week_plan');
    if (!stored) return null;
    const plan = JSON.parse(stored);
    return (plan.weekStart && plan.sessions) ? plan : null;
  } catch { return null; }
}

// Returns a map of dateKey → plan session for the entire week (spans month boundaries).
function buildWeekPlanMap(plan) {
  if (!plan) return {};
  const map = {};
  const weekStart = new Date(plan.weekStart + 'T00:00:00');
  plan.sessions.forEach(s => {
    if (s.type === 'Rest') return;
    const offset = DOW_OFFSETS[s.dayOfWeek];
    if (offset === undefined) return;
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + offset);
    map[getDateKey(date)] = { type: s.type, duration: s.duration, zone: s.zone, note: s.note, fromPlan: true };
  });
  return map;
}

function getDateKey(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

function decorateCell(cell, session, dateKey, isPast, isFxConst, isPlanDay, gridIdx) {
  if (session) {
    cell.classList.add('has-session');
    cell.appendChild(makeDot(session, isPast, dateKey));
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

// Returns a flat map of dateKey → session for all historically agreed plans.
function getHistoryMap() {
  try {
    const history = JSON.parse(localStorage.getItem('bh_plan_history') || '[]');
    const map = {};
    history.forEach(s => { if (s.dateKey) map[s.dateKey] = { ...s, fromPlan: true }; });
    return map;
  } catch { return {}; }
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

function getSessions(phase, offset) {
  const all = SESSION_DATA[phase] || [];
  if (offset >= 3) return all.filter(s => s.type === 'Endurance' && s.d % 3 === 1);
  if (offset >= 2) return all.filter(s => s.type === 'Endurance' || s.type === 'Recovery');
  return all;
}

function makeDot(session, isPast, dateKey) {
  const dot           = document.createElement('div');
  const color         = SESSION_COLORS[session.type] || '#888';
  const fb            = dateKey ? getSessionFeedback(dateKey) : null;
  const lsSkipped     = fb?.skipped === true;
  const lsUnavailable = fb?.unavailable === true;
  const hasRated      = fb !== null && !lsSkipped && !lsUnavailable;
  if (lsUnavailable) {
    dot.className = 'session-dot unavailable';
  } else if (session.skipped || lsSkipped) {
    dot.className = 'session-dot muted';
  } else if (hasRated || (session.fromPlan && isPast)) {
    // Solid only for rated sessions OR plan sessions that are now in the past
    dot.className = 'session-dot solid';
    dot.style.background = color;
  } else {
    dot.className = 'session-dot outline';
    dot.style.borderColor = color;
  }
  return dot;
}

function buildFeedbackDisplay(fb) {
  if (!fb || fb.skipped) return '';
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

// dateKey: 'YYYY-MM-DD', session: may be null, gridIdx: 0-based position in the day grid
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

    const fb            = getSessionFeedback(dateKey);
    const lsSkipped     = fb?.skipped === true;
    const lsUnavailable = fb?.unavailable === true;
    const hasRated      = fb !== null && !lsSkipped && !lsUnavailable;
    const isSkipped     = session.skipped || lsSkipped;
    const isUnavailable = lsUnavailable;
    const todayKey      = getDateKey(new Date());
    const isToday       = dateKey === todayKey;
    const canRate       = !isSkipped && !isUnavailable && (isPast || isToday);
    const canSkip       = !isSkipped && !isUnavailable && !hasRated;
    const canMarkUnavail = !isUnavailable && !isSkipped && !hasRated && !isPast;

    const status = isUnavailable ? 'unavailable' : isSkipped ? 'skipped' : (isPast || hasRated ? 'completed' : 'planned');
    const label  = isUnavailable ? t('statusUnavailable') : isSkipped ? t('statusSkipped') : (isPast || hasRated ? t('statusCompleted') : t('statusPlanned'));

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
      ${hasRated ? buildFeedbackDisplay(fb) : ''}
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        ${canRate       ? `<button class="btn-rate"        style="flex:1;min-width:90px;padding:8px 0;background:transparent;border:1px solid #282828;border-radius:6px;color:#6b6b6b;font-size:12px;font-weight:600;cursor:pointer;">${hasRated ? t('rateSessionEdit') : t('rateSession')}</button>` : ''}
        ${canSkip       ? `<button class="btn-skip"        style="flex:1;min-width:90px;padding:8px 0;background:transparent;border:1px solid #282828;border-radius:6px;color:#6b6b6b;font-size:12px;font-weight:600;cursor:pointer;">${t('markSkipped')}</button>` : ''}
        ${lsSkipped     ? `<button class="btn-undo-skip"   style="flex:1;min-width:90px;padding:8px 0;background:transparent;border:1px solid #282828;border-radius:6px;color:#6b6b6b;font-size:12px;font-weight:600;cursor:pointer;">${t('undoSkipped')}</button>` : ''}
        ${canMarkUnavail? `<button class="btn-unavail"     style="flex:1;min-width:90px;padding:8px 0;background:transparent;border:1px solid #553333;border-radius:6px;color:#8b5050;font-size:12px;font-weight:600;cursor:pointer;">${t('markUnavailable')}</button>` : ''}
        ${lsUnavailable ? `<button class="btn-undo-unavail"style="flex:1;min-width:90px;padding:8px 0;background:transparent;border:1px solid #282828;border-radius:6px;color:#6b6b6b;font-size:12px;font-weight:600;cursor:pointer;">${t('undoUnavailable')}</button>` : ''}
        <button class="btn-discuss" style="flex:2;min-width:120px;padding:8px 0;background:#c9a96e;color:#000;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;opacity:0.9;">${t('discussCoach')}</button>
      </div>`;
    exp.appendChild(sessionDiv);

    sessionDiv.querySelector('.btn-discuss').addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('calendar:sessionSelected', { detail: sessionCtx }));
    });
    if (canRate)        sessionDiv.querySelector('.btn-rate').addEventListener('click',        () => showFeedbackPrompt(dateKey, session.type, () => render(), { preload: hasRated }));
    if (canSkip)        sessionDiv.querySelector('.btn-skip').addEventListener('click',        () => { setSessionFeedback(dateKey, { skipped: true, sessionType: session.type }); render(); });
    if (lsSkipped)      sessionDiv.querySelector('.btn-undo-skip').addEventListener('click',   () => { deleteSessionFeedback(dateKey); render(); });
    if (canMarkUnavail) sessionDiv.querySelector('.btn-unavail').addEventListener('click',     () => { setSessionFeedback(dateKey, { unavailable: true, sessionType: session.type }); render(); });
    if (lsUnavailable)  sessionDiv.querySelector('.btn-undo-unavail').addEventListener('click',() => { deleteSessionFeedback(dateKey); render(); });
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
  const cutoff31   = new Date(todayYear, todayMonth, todayDate + 31); // JS auto-handles month wrap

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

  const hasWeeklyPlan = !!localStorage.getItem('bh_week_plan');
  // Phase template — only used for future days within 31-day window
  const sessions = hasWeeklyPlan ? getSessions(phase, displayOffset) : [];
  const sessionMap = {};
  sessions.forEach(s => { sessionMap[s.d] = s; });

  const weekPlanMap = buildWeekPlanMap(getWeekPlan());
  const historyMap  = getHistoryMap();

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
    const isW31     = !isPast && dateObj <= cutoff31;
    const dayOfWeek = DOW_FULL[dateObj.getDay()];
    const isFxConst = fixedConstraints.includes(dayOfWeek);
    const isPlanDay = !!(planningDay && dayOfWeek === planningDay && !isPast);

    const cell = document.createElement('div');
    cell.className = 'cal-day' + (isToday ? ' today' : '') + (isPast ? ' past' : '');

    const num = document.createElement('div');
    num.className   = 'cal-day-num';
    num.textContent = d;
    cell.appendChild(num);

    // Session precedence:
    // Past → agreed plan (current week past days first, then history)
    // Today/future within 31d → agreed plan, then phase template
    // Beyond 31d → agreed plan only
    let session;
    if (isPast) {
      session = weekPlanMap[dateKey] || historyMap[dateKey] || null;
    } else if (isW31) {
      session = weekPlanMap[dateKey] || (hasWeeklyPlan ? sessionMap[d] : null);
    } else {
      session = weekPlanMap[dateKey] || null;
    }

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
      const isW31     = dateObj <= cutoff31;
      const dayOfWeek = DOW_FULL[dateObj.getDay()];
      const isFxConst = fixedConstraints.includes(dayOfWeek);
      const isPlanDay = !!(planningDay && dayOfWeek === planningDay);

      const num = document.createElement('div');
      num.className   = 'cal-day-num';
      num.textContent = i;
      cell.appendChild(num);

      const session = isW31
        ? (weekPlanMap[dateKey] || (hasWeeklyPlan ? sessionMap[daysInMonth + i] : null))
        : (weekPlanMap[dateKey] || null);

      decorateCell(cell, session, dateKey, false, isFxConst, isPlanDay, startOffset + daysInMonth + i - 1);
      grid.appendChild(cell);
    }
  }
}
