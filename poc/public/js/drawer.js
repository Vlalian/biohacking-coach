// Session Drawer — the single detail surface for sessions. A right-side panel
// mirroring the Navigation Drawer's behavior: overlays the content area,
// dismissed by tapping outside or the close button. Replaces the former
// inline calendar expansion.
import { getSession, updateSession, sessionsForDay, weekStartOf, getDateKey, SESSION_COLORS, SESSION_DEFAULTS } from './store.js';
import { createAthleteSession, editAthleteSession, deleteAthleteSession } from './moves.js';
import { showSessionFeedbackPrompt } from './feedback.js';
import { t } from './translations.js';

const ATHLETE_TYPES = ['Mobility', 'Strength', 'Other'];

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
      <span style="font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.1em;">${t('feedbackBodyShort')}</span>
      <span style="font-size:13px;font-weight:700;color:#e2e2e2;">${body}</span>
      <span style="font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.1em;margin-left:8px;">${t('feedbackMindShort')}</span>
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
  const isCompleted   = session.status === 'completed';
  // Completed without feedback happens when a retro-log's rating prompt was
  // dismissed — the session stays done, the rating stays on offer.
  const hasRated      = isCompleted && !!session.feedback;
  const todayKey      = getDateKey(new Date());
  const isPast        = session.dateKey < todayKey;
  const isToday       = session.dateKey === todayKey;

  const isParked      = session.parked === true;

  const canRate        = !isRest && !isSkipped && !isUnavailable && (isPast || isToday);
  const canSkip        = !isRest && session.status === 'planned';
  const canMarkUnavail = !isRest && session.status === 'planned' && !isPast;
  // A parked session's way back is a move (or the Weekly Session) — the
  // undo button would just re-park it against the Rest still on the day.
  const canUndoUnavail = isUnavailable && !isParked;

  const label = isUnavailable ? t('statusUnavailable')
              : isSkipped     ? t('statusSkipped')
              : isCompleted   ? t('statusCompleted')
              : t('statusPlanned');

  // Athlete Sessions are the athlete's territory: editable and deletable —
  // but past weeks are frozen; retro-log creation is the one action that
  // reaches them. Coach content is read-only and never deletable.
  const canEdit = session.origin === 'athlete'
    && weekStartOf(session.dateKey) >= weekStartOf(todayKey);

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
    ${session.title ? `<div class="sd-title">${session.title}</div>` : ''}
    ${duration || zone ? `<div class="sd-meta">${[duration, zone].filter(Boolean).join(' &nbsp;·&nbsp; ')}</div>` : ''}
    ${note ? `<p class="sd-note">${note}</p>` : ''}
    ${isParked ? `<div class="sd-parked">${t('parkedExplain')}</div>` : ''}
    ${hasRated ? feedbackDisplay(session.feedback) : ''}
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
      ${canRate        ? `<button class="btn-rate" style="${BTN_STYLE}">${hasRated ? t('rateSessionEdit') : t('rateSession')}</button>` : ''}
      ${canSkip        ? `<button class="btn-skip" style="${BTN_STYLE}">${t('markSkipped')}</button>` : ''}
      ${isSkipped      ? `<button class="btn-undo-skip" style="${BTN_STYLE}">${t('undoSkipped')}</button>` : ''}
      ${canMarkUnavail ? `<button class="btn-unavail" style="${WARN_STYLE}">${t('markUnavailable')}</button>` : ''}
      ${canUndoUnavail ? `<button class="btn-undo-unavail" style="${BTN_STYLE}">${t('undoUnavailable')}</button>` : ''}
      ${canEdit        ? `<button class="btn-edit" style="${BTN_STYLE}">${t('editSession')}</button>` : ''}
      ${canEdit        ? `<button class="btn-delete-session" style="${WARN_STYLE}">${t('deleteSession')}</button>` : ''}
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
  if (canUndoUnavail) panel.querySelector('.btn-undo-unavail').addEventListener('click', () => { updateSession(session.id, { status: 'planned' }); refresh(); });
  if (canEdit) {
    panel.querySelector('.btn-edit').addEventListener('click', () => renderAthleteForm(panel, { session }));
    panel.querySelector('.btn-delete-session').addEventListener('click', () => {
      deleteAthleteSession(session.id);
      closeSessionDrawer();
      notifyChange();
    });
  }
}

export function openSessionDrawer(sessionId, { onChange } = {}) {
  if (onChange) onChangeCb = onChange;
  const panel = openPanel();
  renderSessionContent(panel, sessionId);
}

// ── Athlete Session create / edit form ────────────────────────────────────────

const INPUT_STYLE = 'width:100%;background:#141414;border:1px solid #282828;border-radius:8px;color:#e2e2e2;' +
  'font-size:13px;font-family:inherit;padding:10px 12px;outline:none;box-sizing:border-box;margin-bottom:10px;';

// "+" on a day opens the drawer in create mode. On a past day the session is
// retro-logged: created as already completed, chaining straight into the
// rating prompt — there is no deadline on recording reality.
export function openCreateDrawer(dateKey, { onChange } = {}) {
  if (onChange) onChangeCb = onChange;
  const panel = openPanel();
  renderAthleteForm(panel, { dateKey });
}

function renderAthleteForm(panel, { dateKey, session = null }) {
  const isEdit  = !!session;
  const day     = session ? session.dateKey : dateKey;
  // On Rest days only non-training types are offered — they coexist with Rest.
  const restDay = sessionsForDay(day).some(s => s.type === 'Rest');
  const types   = restDay ? ['Mobility', 'Other'] : ATHLETE_TYPES;

  const state = {
    type:       session?.type || types[0],
    isTraining: session ? session.isTraining : false,
  };
  // Mobility is fixed not-training, Strength fixed training; Other carries its
  // own toggle — locked to not-training on Rest days.
  const trainingLocked = () => state.type !== 'Other' || restDay;
  const trainingFor    = type => type === 'Strength' && !restDay;
  if (!isEdit) state.isTraining = trainingFor(state.type);

  panel.innerHTML = `
    ${closeButtonHtml()}
    <div class="sd-row"><span class="sd-type" style="color:#c9a96e">${isEdit ? t('editSessionTitle') : t('createSessionTitle')}</span></div>
    <div class="sd-date">${fullDate(day)}</div>
    <div class="sd-form-label">${t('createTypeLabel')}</div>
    <div class="sd-type-picker">
      ${types.map(ty => `<button data-type="${ty}" class="sd-type-btn${ty === state.type ? ' active' : ''}"${isEdit ? ' disabled' : ''}>${ty}</button>`).join('')}
    </div>
    <button id="sd-training-toggle" class="sd-type-btn" style="width:100%;margin-bottom:14px;"></button>
    <input id="sd-title" style="${INPUT_STYLE}" placeholder="${t('createTitlePlaceholder')}" value="${session?.title || ''}">
    <input id="sd-duration" style="${INPUT_STYLE}" placeholder="${t('createDurationPlaceholder')}" value="${session?.duration || ''}">
    <textarea id="sd-note" rows="3" style="${INPUT_STYLE}resize:none;" placeholder="${t('createNotePlaceholder')}">${session?.note || ''}</textarea>
    <button id="sd-save" style="width:100%;padding:11px;background:#c9a96e;color:#000;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">${isEdit ? t('editSave') : t('createSave')}</button>`;

  wireClose(panel);

  const toggle = panel.querySelector('#sd-training-toggle');
  function syncToggle() {
    toggle.textContent    = state.isTraining ? t('countsAsTraining') : t('notTraining');
    toggle.disabled       = trainingLocked();
    toggle.style.opacity  = trainingLocked() ? '0.55' : '1';
    toggle.classList.toggle('active', state.isTraining);
  }
  syncToggle();
  toggle.addEventListener('click', () => {
    if (trainingLocked()) return;
    state.isTraining = !state.isTraining;
    syncToggle();
  });

  panel.querySelectorAll('[data-type]').forEach(btn => btn.addEventListener('click', () => {
    if (isEdit) return;
    state.type = btn.dataset.type;
    state.isTraining = trainingFor(state.type);
    panel.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === state.type));
    syncToggle();
  }));

  panel.querySelector('#sd-save').addEventListener('click', () => {
    const fields = {
      title:    panel.querySelector('#sd-title').value.trim() || null,
      duration: panel.querySelector('#sd-duration').value.trim() || null,
      note:     panel.querySelector('#sd-note').value.trim() || null,
      isTraining: state.isTraining,
    };
    if (isEdit) {
      editAthleteSession(session.id, fields);
      notifyChange();
      renderSessionContent(panel, session.id);
      return;
    }
    const created = createAthleteSession({ dateKey: day, type: state.type, ...fields });
    notifyChange();
    if (created.status === 'completed') {
      // Retro-log: the rating is offered immediately in the same create flow.
      closeSessionDrawer();
      showSessionFeedbackPrompt(created, () => notifyChange(), { preload: false });
    } else {
      renderSessionContent(panel, created.id);
    }
  });
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
