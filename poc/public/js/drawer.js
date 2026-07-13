// Session Drawer — the single detail surface for sessions. A right-side panel
// mirroring the Navigation Drawer's behavior: overlays the content area,
// dismissed by tapping outside or the close button. Replaces the former
// inline calendar expansion.
import { getSession, updateSession, SESSION_COLORS, SESSION_DEFAULTS } from './store.js';
import { showSessionFeedbackPrompt } from './feedback.js';
import { t } from './translations.js';

let onChangeCb = null; // notifies the calendar that store state changed

function ensureDrawerDom() {
  let overlay = document.getElementById('sessionDrawerOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sessionDrawerOverlay';
    overlay.className = 'session-drawer-overlay';
    overlay.addEventListener('click', closeSessionDrawer);
    document.body.appendChild(overlay);
  }
  let panel = document.getElementById('sessionDrawer');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'sessionDrawer';
    panel.className = 'session-drawer';
    document.body.appendChild(panel);
  }
  return { overlay, panel };
}

export function closeSessionDrawer() {
  document.getElementById('sessionDrawer')?.classList.remove('open');
  document.getElementById('sessionDrawerOverlay')?.classList.remove('open');
}

function openPanel() {
  const { overlay, panel } = ensureDrawerDom();
  overlay.classList.add('open');
  panel.classList.add('open');
  return panel;
}

function notifyChange() {
  if (onChangeCb) onChangeCb();
}

function fullDate(dateKey) {
  return new Date(dateKey + 'T00:00:00')
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function closeButtonHtml() {
  return '<button class="sd-close" aria-label="Close">×</button>';
}

function wireClose(panel) {
  panel.querySelector('.sd-close').addEventListener('click', closeSessionDrawer);
}

function feedbackDisplay(fb) {
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

const BTN_STYLE  = 'width:100%;padding:9px 0;background:transparent;border:1px solid #282828;border-radius:6px;color:#6b6b6b;font-size:12px;font-weight:600;cursor:pointer;';
const WARN_STYLE = 'width:100%;padding:9px 0;background:transparent;border:1px solid #553333;border-radius:6px;color:#8b5050;font-size:12px;font-weight:600;cursor:pointer;';

function renderSessionContent(panel, sessionId) {
  const session = getSession(sessionId);
  if (!session) { closeSessionDrawer(); return; }

  const defaults = SESSION_DEFAULTS[session.type] || {};
  const duration = session.duration || defaults.duration || '';
  const zone     = session.zone     || defaults.zone     || '';
  const note     = session.note     || defaults.note     || '';
  const color    = SESSION_COLORS[session.type] || '#888';

  const isRest        = session.type === 'Rest';
  const isSkipped     = session.status === 'skipped';
  const isUnavailable = session.status === 'unavailable';
  const hasRated      = session.status === 'completed' && !!session.feedback;
  const now           = new Date();
  const todayKey      = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isPast        = session.dateKey < todayKey;
  const isToday       = session.dateKey === todayKey;

  const canRate        = !isRest && !isSkipped && !isUnavailable && (isPast || isToday);
  const canSkip        = !isRest && !isSkipped && !isUnavailable && !hasRated;
  const canMarkUnavail = !isRest && !isUnavailable && !isSkipped && !hasRated && !isPast;

  const label = isUnavailable ? t('statusUnavailable')
              : isSkipped     ? t('statusSkipped')
              : hasRated      ? t('statusCompleted')
              : t('statusPlanned');

  const dayLabel = new Date(session.dateKey + 'T00:00:00')
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const sessionCtx = { type: session.type, dayLabel, duration, zone, note, status: session.status };

  panel.innerHTML = `
    ${closeButtonHtml()}
    <div class="sd-row">
      <span class="sd-type" style="color:${color}">${session.type}</span>
      <span class="sd-badge ${session.status}">${label}</span>
    </div>
    <div class="sd-date">${fullDate(session.dateKey)}</div>
    ${duration || zone ? `<div class="sd-meta">${[duration, zone].filter(Boolean).join(' &nbsp;·&nbsp; ')}</div>` : ''}
    ${note ? `<p class="sd-note">${note}</p>` : ''}
    ${hasRated ? feedbackDisplay(session.feedback) : ''}
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
      ${canRate        ? `<button class="btn-rate" style="${BTN_STYLE}">${hasRated ? t('rateSessionEdit') : t('rateSession')}</button>` : ''}
      ${canSkip        ? `<button class="btn-skip" style="${BTN_STYLE}">${t('markSkipped')}</button>` : ''}
      ${isSkipped      ? `<button class="btn-undo-skip" style="${BTN_STYLE}">${t('undoSkipped')}</button>` : ''}
      ${canMarkUnavail ? `<button class="btn-unavail" style="${WARN_STYLE}">${t('markUnavailable')}</button>` : ''}
      ${isUnavailable  ? `<button class="btn-undo-unavail" style="${BTN_STYLE}">${t('undoUnavailable')}</button>` : ''}
      <button class="btn-discuss" style="width:100%;padding:10px 0;background:#c9a96e;color:#000;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;opacity:0.9;">${t('discussCoach')}</button>
    </div>`;

  wireClose(panel);

  const refresh = () => { renderSessionContent(panel, sessionId); notifyChange(); };

  panel.querySelector('.btn-discuss').addEventListener('click', () => {
    closeSessionDrawer();
    document.dispatchEvent(new CustomEvent('calendar:sessionSelected', { detail: sessionCtx }));
  });
  if (canRate)        panel.querySelector('.btn-rate').addEventListener('click',         () => showSessionFeedbackPrompt(session, refresh, { preload: hasRated }));
  if (canSkip)        panel.querySelector('.btn-skip').addEventListener('click',         () => { updateSession(session.id, { status: 'skipped' }); refresh(); });
  if (isSkipped)      panel.querySelector('.btn-undo-skip').addEventListener('click',    () => { updateSession(session.id, { status: 'planned' }); refresh(); });
  if (canMarkUnavail) panel.querySelector('.btn-unavail').addEventListener('click',      () => { updateSession(session.id, { status: 'unavailable' }); refresh(); });
  if (isUnavailable)  panel.querySelector('.btn-undo-unavail').addEventListener('click', () => { updateSession(session.id, { status: 'planned' }); refresh(); });
}

export function openSessionDrawer(sessionId, { onChange } = {}) {
  if (onChange) onChangeCb = onChange;
  const panel = openPanel();
  renderSessionContent(panel, sessionId);
}

// The planning-day marker opens the drawer with the Weekly Session CTA.
export function openPlanningDrawer() {
  const panel = openPanel();
  panel.innerHTML = `
    ${closeButtonHtml()}
    <div style="font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#c9a96e;margin:20px 0 6px;">${t('planningDayTitle')}</div>
    <div style="font-size:13px;color:#a0a0a0;margin-bottom:14px;">${t('planningDayDesc')}</div>
    <button class="btn-plan-week" style="width:100%;padding:10px;background:#c9a96e;color:#000;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">${t('startWeeklySession')}</button>`;
  wireClose(panel);
  panel.querySelector('.btn-plan-week').addEventListener('click', () => {
    closeSessionDrawer();
    window.switchView('coach');
    setTimeout(() => window.startWeeklySession(), 50);
  });
}
