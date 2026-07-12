import { t } from './translations.js';
import { sessionsForDay, rateDay } from './store.js';

function rpeLabel(val) {
  return (t('rpeLabels') || [])[val] || '';
}

// Smooth HSL gradient: RPE 1 = green (hue 120), RPE 10 = dark red (hue 0)
function rpeHue(val) {
  return Math.round(120 - (val - 1) * (120 / 9));
}
function rpeBg(val, active) {
  const h = rpeHue(val);
  return active ? `hsl(${h},48%,20%)` : `hsl(${h},28%,11%)`;
}
function rpeBorder(val, active) {
  const h = rpeHue(val);
  return active ? `hsl(${h},62%,48%)` : `hsl(${h},32%,24%)`;
}
function rpeText(val, active) {
  const h = rpeHue(val);
  return active ? `hsl(${h},75%,63%)` : `hsl(${h},38%,42%)`;
}

// The day's rateable session — feedback data lives on session entities now.
function primarySession(dateKey) {
  return sessionsForDay(dateKey).find(s => s.type !== 'Rest') || null;
}

function rpeRow(dim, label, existing) {
  const btns = Array.from({ length: 10 }, (_, i) => {
    const val    = i + 1;
    const active = existing === val;
    return `<button data-val="${val}" data-dim="${dim}" style="flex:1;font-size:12px;font-weight:600;padding:8px 2px;background:${rpeBg(val, active)};border:1px solid ${rpeBorder(val, active)};border-radius:6px;cursor:pointer;color:${rpeText(val, active)};transition:all 0.12s;">${val}</button>`;
  }).join('');
  const initialDesc = existing ? rpeLabel(existing) : '';
  return `
    <div style="margin-bottom:18px;">
      <div style="font-size:10px;font-weight:600;letter-spacing:0.13em;text-transform:uppercase;color:#6b6b6b;margin-bottom:10px;">${label}</div>
      <div style="display:flex;gap:4px;">${btns}</div>
      <div data-desc="${dim}" style="min-height:18px;margin-top:8px;font-size:12px;color:#a0a0a0;font-style:italic;transition:opacity 0.15s;">${initialDesc}</div>
    </div>`;
}

export function showFeedbackPrompt(dateKey, sessionType, onSubmit, { preload = true } = {}) {
  document.getElementById('bh-feedback-modal')?.remove();

  const existing = preload ? (primarySession(dateKey)?.feedback || {}) : {};
  const selected = { body: existing.body || 0, mind: existing.mind || 0 };

  const overlay = document.createElement('div');
  overlay.id = 'bh-feedback-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:#1e1e1e;border:1px solid #282828;border-radius:16px;padding:28px;width:100%;max-width:420px;';
  modal.innerHTML = `
    <div style="font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#c9a96e;margin-bottom:6px;">${t('feedbackTitle')}</div>
    <div style="font-size:15px;font-weight:600;color:#e2e2e2;margin-bottom:24px;">${sessionType} — ${t('feedbackSubtitle')}</div>
    ${rpeRow('body', t('feedbackBodyRpe'), existing.body)}
    ${rpeRow('mind', t('feedbackMindRpe'), existing.mind)}
    <div style="margin-bottom:22px;">
      <div style="font-size:10px;font-weight:600;letter-spacing:0.13em;text-transform:uppercase;color:#6b6b6b;margin-bottom:8px;">${t('feedbackComment')}</div>
      <textarea id="bh-feedback-comment" rows="3" placeholder="${t('feedbackCommentPlaceholder')}" style="width:100%;background:#141414;border:1px solid #282828;border-radius:8px;color:#e2e2e2;font-size:13px;font-family:inherit;padding:12px;resize:none;outline:none;box-sizing:border-box;">${existing.comment || ''}</textarea>
    </div>
    <div style="display:flex;gap:10px;">
      <button id="bh-fb-skip" style="flex:1;padding:12px;background:transparent;border:1px solid #282828;border-radius:8px;color:#6b6b6b;font-size:12px;cursor:pointer;">${t('feedbackSkip')}</button>
      <button id="bh-fb-save" style="flex:2;padding:12px;background:#c9a96e;border:none;border-radius:8px;color:#0a0a0a;font-size:12px;font-weight:700;cursor:pointer;" disabled>${t('feedbackSave')}</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function updateSave() {
    const btn   = modal.querySelector('#bh-fb-save');
    const ready = selected.body > 0 && selected.mind > 0;
    btn.disabled      = !ready;
    btn.style.opacity = ready ? '1' : '0.4';
    btn.style.cursor  = ready ? 'pointer' : 'not-allowed';
  }

  function highlight(dim, val) {
    modal.querySelectorAll(`[data-dim="${dim}"]`).forEach(b => {
      const bVal = parseInt(b.dataset.val);
      const on   = bVal === val;
      b.style.background  = rpeBg(bVal, on);
      b.style.borderColor = rpeBorder(bVal, on);
      b.style.color       = rpeText(bVal, on);
    });
    modal.querySelector(`[data-desc="${dim}"]`).textContent = rpeLabel(val);
  }

  if (existing.body) highlight('body', existing.body);
  if (existing.mind) highlight('mind', existing.mind);
  updateSave();

  modal.addEventListener('click', e => {
    const btn = e.target.closest('[data-dim]');
    if (!btn) return;
    selected[btn.dataset.dim] = parseInt(btn.dataset.val);
    highlight(btn.dataset.dim, selected[btn.dataset.dim]);
    updateSave();
  });

  modal.querySelector('#bh-fb-skip').addEventListener('click', () => overlay.remove());

  modal.querySelector('#bh-fb-save').addEventListener('click', () => {
    const comment = modal.querySelector('#bh-feedback-comment').value.trim();
    const data    = { body: selected.body, mind: selected.mind, comment };
    rateDay(dateKey, sessionType, data);
    overlay.remove();
    onSubmit(data);
  });

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
