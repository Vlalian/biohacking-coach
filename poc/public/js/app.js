import { render as renderCalendar, navigateMonth } from './calendar.js';
import { save, restore, activeHistoryKey } from './persistence.js';
import { PERSONAS, HISTORY_SCENARIOS, HISTORY_LABELS } from './personas.js';
import {
  sendPushback,
  discussWithCoach, startWeeklySession, sendWeeklyMessage, agreeWeeklyPlan,
  startCoachChat, sendChatMessage, endCoachChat,
} from './conversation.js';
import { showFeedbackPrompt, showSessionFeedbackPrompt } from './feedback.js';
import { initStore, getMigrationReport, dismissMigrationReport, getLastWeekFeedback, getSkippedSessions, sessionsForDay } from './store.js';
import { isOnboarded, getOnboardedProfile, beginOnboarding } from './onboarding.js';
import { t, applyStaticTranslations } from './translations.js';

// ── App-level state ───────────────────────────────────────────────────────────
let experienceLevel = 'intermediate';
let sessionHistory  = [];

// ── Read form ─────────────────────────────────────────────────────────────────
function readCheckIn() {
  const profile = getOnboardedProfile() || {};
  return {
    body:         parseInt(document.getElementById('body').value),
    mental:       parseInt(document.getElementById('mental').value),
    energy:       parseInt(document.getElementById('energy').value),
    sleep:        parseFloat(document.getElementById('sleep').value),
    pulse:        parseInt(document.getElementById('pulse').value),
    phase:        document.getElementById('phase').value,
    sessionCount: parseInt(document.getElementById('sessionCount').value) || 0,
    personaName:       window._personaName      || '',
    commStyle:         window._commStyle        || '',
    language:          window._language         || 'English',
    weeklySessionDay:  window._weeklySessionDay || 'Flexible',
    fixedConstraints:  window._fixedConstraints || [],
    experienceLevel,
    equipment:   JSON.parse(localStorage.getItem('bh_equipment') || '{}'),
    raceTarget:  profile.raceTarget || '',
    onboarding: {
      sportBackground:   profile.sportBackground   || null,
      weeklyHours:       profile.weeklyHours       || null,
      motivation:        profile.motivation        || null,
      bestTime:          profile.bestTime          || null,
      weakestDiscipline: profile.weakestDiscipline || null,
      hasHumanCoach:     profile.hasHumanCoach     || null,
      targetTime:        profile.targetTime        || null,
      trackedMetrics:    profile.trackedMetrics    || null,
    },
  };
}

// ── Navigation Drawer ─────────────────────────────────────────────────────────
function openDrawer() {
  document.getElementById('navDrawer').classList.add('open');
  document.getElementById('navOverlay').classList.add('open');
}
function closeDrawer() {
  document.getElementById('navDrawer').classList.remove('open');
  document.getElementById('navOverlay').classList.remove('open');
}
const VIEWS = ['coach', 'training-plan', 'equipment', 'glossary', 'settings', 'policy'];
function switchView(view) {
  closeDrawer();
  VIEWS.forEach(v => {
    document.getElementById(v + '-view').style.display = v === view ? 'block' : 'none';
  });
  ['navCoach', 'navTrainingPlan', 'navEquipment', 'navGlossary', 'navSettings', 'navPolicy'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === 'nav' + view.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(''));
  });
  if (view === 'training-plan') renderCalendar();
  if (view === 'settings') renderSettings();
  if (view === 'equipment') renderEquipment();
  applyStaticTranslations();
}

// ── Persona loader ────────────────────────────────────────────────────────────
function setSlider(id, val) {
  document.getElementById(id).value = val;
  document.getElementById(id + 'Val').textContent = val;
}

function loadPersona(key, el) {
  document.querySelectorAll('.persona').forEach(p => p.classList.remove('active'));
  el.classList.add('active');

  if (key === 'none') {
    const profile = getOnboardedProfile();
    if (profile) {
      window._personaName        = profile.personaName        || '';
      window._commStyle          = profile.commStyle          || '';
      window._language           = profile.language           || 'English';
      window._weeklySessionDay   = profile.weeklySessionDay   || 'Flexible';
      window._fixedConstraints   = profile.fixedConstraints   || [];
      if (profile.experienceLevel) setExperience(profile.experienceLevel);
      if (profile.phase) document.getElementById('phase').value = profile.phase;
    } else {
      window._personaName      = '';
      window._commStyle        = '';
      window._language         = localStorage.getItem('bca_language') || 'English';
      window._weeklySessionDay = 'Flexible';
      window._fixedConstraints = [];
    }
    saveState();
    return;
  }

  const p = PERSONAS[key];
  window._personaName      = p.name;
  window._commStyle        = p.commStyle || '';
  window._language         = 'English';
  window._weeklySessionDay = 'Flexible';
  window._fixedConstraints = [];

  if (p.experienceLevel) setExperience(p.experienceLevel);

  setSlider('body',   p.body);
  setSlider('mental', p.mental);
  setSlider('energy', p.energy);
  document.getElementById('sleep').value        = p.sleep;
  document.getElementById('pulse').value        = p.pulse;
  document.getElementById('phase').value        = p.phase;
  document.getElementById('sessionCount').value = p.sessionCount;
  updateReflectiveBadge(p.sessionCount);
  saveState();
}

// ── Experience level ──────────────────────────────────────────────────────────
function setExperience(level) {
  experienceLevel = level;
  document.querySelectorAll('#exp-beginner, #exp-intermediate, #exp-veteran')
    .forEach(e => e.classList.remove('active'));
  const el = document.getElementById('exp-' + level);
  if (el) el.classList.add('active');
}

// ── Session history presets ───────────────────────────────────────────────────
function loadHistory(key, el) {
  document.querySelectorAll('.history-scenarios .scenario').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  sessionHistory = key === 'none' ? [] : (HISTORY_SCENARIOS[key] || []);
  const badge = document.getElementById('historyBadge');
  badge.textContent  = HISTORY_LABELS[key] || '';
  badge.style.color  = key === 'none' ? 'var(--muted)' : 'var(--accent)';
  saveState();
}

// ── UI badges ─────────────────────────────────────────────────────────────────
function updateReflectiveBadge(count) {
  const badge = document.getElementById('reflectiveBadge');
  if (count >= 5) {
    badge.textContent = `Reflective Prompt eligible (${count} sessions)`;
    badge.style.color = 'var(--accent)';
  } else {
    badge.textContent = `Direct mode — ${count} session${count === 1 ? '' : 's'} (need 5+ for Reflective Prompt)`;
    badge.style.color = 'var(--muted)';
  }
}

// ── Input sanitization ────────────────────────────────────────────────────────
function sanitizeNumber(el, min, max, isFloat) {
  let val = isFloat ? parseFloat(el.value) : parseInt(el.value, 10);
  if (isNaN(val)) { el.value = min; return; }
  el.value = Math.min(max, Math.max(min, val));
}

// ── Onboarding helpers ────────────────────────────────────────────────────────
function updateCustomPersonaLabel() {
  const profile = getOnboardedProfile();
  if (!profile || !profile.personaName || profile.personaName === 'Athlete') return;
  const btn = document.querySelector('.personas .persona:first-child');
  if (btn) {
    btn.querySelector('.pname').textContent = profile.personaName;
    btn.querySelector('.prole').textContent = 'Your profile';
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────
function saveState() {
  save(experienceLevel, activeHistoryKey());
}

function restoreState() {
  const { experienceLevel: savedExp, historyKey, commStyle } = restore();
  const _profile           = (() => { try { return JSON.parse(localStorage.getItem('bh_athlete_profile') || 'null'); } catch { return null; } })();
  window._language         = localStorage.getItem('bca_language') || _profile?.language || 'English';
  window._weeklySessionDay = _profile?.weeklySessionDay || 'Flexible';
  window._fixedConstraints = _profile?.fixedConstraints || [];

  experienceLevel = savedExp;
  document.querySelectorAll('#exp-beginner, #exp-intermediate, #exp-veteran')
    .forEach(e => e.classList.remove('active'));
  const expEl = document.getElementById('exp-' + savedExp);
  if (expEl) expEl.classList.add('active');

  document.querySelectorAll('.history-scenarios .scenario').forEach(btn => {
    const m = btn.getAttribute('onclick')?.match(/loadHistory\('([^']+)'/);
    btn.classList.toggle('active', m?.[1] === historyKey);
  });
  const baseHistory     = historyKey === 'none' ? [] : (HISTORY_SCENARIOS[historyKey] || []);
  const importedRaw     = localStorage.getItem('bca_importedSessions');
  const importedHistory = importedRaw ? JSON.parse(importedRaw) : [];
  sessionHistory        = [...baseHistory, ...importedHistory];
  const hBadge = document.getElementById('historyBadge');
  if (hBadge) {
    hBadge.textContent = HISTORY_LABELS[historyKey] || '';
    hBadge.style.color = historyKey === 'none' ? 'var(--muted)' : 'var(--accent)';
  }

  const countEl = document.getElementById('sessionCount');
  if (countEl) updateReflectiveBadge(parseInt(countEl.value) || 0);
}

// ── Migration report notice ───────────────────────────────────────────────────
// One-time dismissable notice with the carried-over counts, shown after the
// one-shot entity-store migration until the athlete dismisses it.
function showMigrationNoticeIfPending() {
  const report = getMigrationReport();
  if (!report || report.dismissed) return;

  const summary = t('migrationSummary')
    .replace('{sessions}',    report.sessions)
    .replace('{ratings}',     report.ratings)
    .replace('{skips}',       report.skips)
    .replace('{unavailable}', report.unavailable);

  const notice = document.createElement('div');
  notice.id = 'bh-migration-notice';
  notice.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:300;' +
    'background:#1e1a12;border:1px solid #c9a96e;border-radius:10px;padding:14px 18px;max-width:420px;width:calc(100% - 40px);box-sizing:border-box;';
  notice.innerHTML = `
    <div style="font-size:10px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#c9a96e;margin-bottom:6px;">${t('migrationTitle')}</div>
    <div style="font-size:13px;color:#e2e2e2;line-height:1.5;">${summary}</div>
    <button id="bh-migration-dismiss" style="margin-top:10px;padding:8px 14px;background:transparent;border:1px solid #282828;border-radius:6px;color:#a0a0a0;font-size:12px;font-weight:600;cursor:pointer;">${t('migrationDismiss')}</button>`;
  document.body.appendChild(notice);
  notice.querySelector('#bh-migration-dismiss').addEventListener('click', () => {
    dismissMigrationReport();
    notice.remove();
  });
}

// ── Event wiring ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initStore();
  showMigrationNoticeIfPending();

  if (!isOnboarded()) {
    beginOnboarding();
  } else {
    restoreState();
    updateCustomPersonaLabel();
    applyStaticTranslations();
  }

  // Keyboard shortcuts for the text areas
  document.getElementById('pushbackInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('sendBtn').click(); }
  });
// Auto-save on any input inside the check-in card
  document.addEventListener('input',  e => { if (e.target.closest('.card')) saveState(); });
  document.addEventListener('change', e => { if (e.target.closest('.card')) saveState(); });

  // Training plan → coach handoff via typed event (replaces window._pendingDiscussion)
  document.addEventListener('calendar:sessionSelected', e => {
    switchView('coach');
    discussWithCoach(readCheckIn(), sessionHistory, e.detail);
  });

  // Phase change re-renders calendar if it's visible
  document.getElementById('phase').addEventListener('change', () => {
    if (document.getElementById('training-plan-view').style.display !== 'none') {
      renderCalendar();
    }
  });
});

// ── Global bindings (called from inline HTML onclick attributes) ──────────────
// These bridge the HTML onclick attributes to the module functions.
window.toggleDrawer   = () => {
  document.getElementById('navDrawer').classList.contains('open') ? closeDrawer() : openDrawer();
};
window.closeDrawer    = closeDrawer;
window.switchView     = switchView;
window.navigateMonth  = navigateMonth;
window.loadPersona    = loadPersona;
window.loadHistory    = loadHistory;
window.sanitizeNumber = sanitizeNumber;

window.setExperience = (level, el) => {
  document.querySelectorAll('#exp-beginner, #exp-intermediate, #exp-veteran').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  experienceLevel = level;
  saveState();
};

window.updateReflectiveBadge = (count) => {
  updateReflectiveBadge(count);
  saveState();
};

window.sendPushback = () => sendPushback(readCheckIn(), sessionHistory);

// Session numbering lives in conversation.js — it only counts sessions that
// actually start (first Coach reply received), so cancelled or failed starts
// don't advance the arc.
window.startWeeklySession = () =>
  startWeeklySession(readCheckIn(), sessionHistory, getLastWeekFeedback(), getSkippedSessions());
window.sendWeeklyMessage  = () => sendWeeklyMessage(readCheckIn(), sessionHistory, getLastWeekFeedback(), getSkippedSessions());
window.agreeWeeklyPlan    = agreeWeeklyPlan;

window.startCoachChat  = () => startCoachChat(readCheckIn());
window.sendChatMessage = () => sendChatMessage(readCheckIn());
window.endCoachChat    = endCoachChat;


window.launchApp = () => {
  document.getElementById('onboarding-view').style.display = 'none';
  document.getElementById('coach-view').style.display      = 'block';
  restoreState();
  updateCustomPersonaLabel();
  applyStaticTranslations();
};

// ── Equipment page ────────────────────────────────────────────────────────────
function renderEquipment() {
  const eq = JSON.parse(localStorage.getItem('bh_equipment') || '{}');
  document.querySelectorAll('#equipment-view [data-eq]').forEach(el => {
    el.value = eq[el.dataset.eq] || '';
  });
}

window.saveEquipment = () => {
  const eq = {};
  document.querySelectorAll('#equipment-view [data-eq]').forEach(el => {
    eq[el.dataset.eq] = el.value.trim();
  });
  localStorage.setItem('bh_equipment', JSON.stringify(eq));
  const btn = document.querySelector('#equipment-view button[onclick="saveEquipment()"]');
  if (btn) { btn.textContent = '✓ Saved'; setTimeout(() => { btn.textContent = t('eqSave'); }, 1800); }
};

// ── Settings page ─────────────────────────────────────────────────────────────
let _settingsLang = null;

function renderSettings() {
  const profile = getOnboardedProfile() || {};
  _settingsLang = null;

  const nameEl = document.getElementById('settings-name');
  if (nameEl) nameEl.value = profile.personaName || '';

  const raceEl = document.getElementById('settings-race');
  if (raceEl) raceEl.value = profile.targetRace || '';

  const planDayEl = document.getElementById('settings-planday');
  if (planDayEl) planDayEl.value = profile.weeklySessionDay || 'Flexible';

  const lang = localStorage.getItem('bca_language') || profile.language || 'English';
  const enBtn = document.getElementById('settings-lang-en');
  const daBtn = document.getElementById('settings-lang-da');
  if (enBtn && daBtn) {
    const isDa = lang === 'Dansk';
    enBtn.style.background = isDa ? 'transparent' : 'var(--accent)';
    enBtn.style.color      = isDa ? 'var(--muted)' : '#0a0a0a';
    daBtn.style.background = isDa ? 'var(--accent)' : 'transparent';
    daBtn.style.color      = isDa ? '#0a0a0a' : 'var(--muted)';
  }

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const constraints = profile.fixedConstraints || [];
  const dowLabels = t('dow'); // translated abbreviations e.g. ['Man','Tir',...] in Danish
  const container = document.getElementById('settings-constraints');
  if (container) {
    container.innerHTML = DAYS.map((d, i) => {
      const active = constraints.includes(d);
      return `<button onclick="settingsToggleConstraint(this)" data-day="${d}" data-active="${active}" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:${active ? 'var(--surface-3)' : 'transparent'};color:${active ? 'var(--text)' : 'var(--muted)'};font-size:12px;font-family:inherit;cursor:pointer;">${dowLabels[i] || d.slice(0,3)}</button>`;
    }).join('');
  }
}

window.settingsSetLang = (lang) => {
  _settingsLang = lang;
  const enBtn = document.getElementById('settings-lang-en');
  const daBtn = document.getElementById('settings-lang-da');
  const isDa = lang === 'Dansk';
  enBtn.style.background = isDa ? 'transparent' : 'var(--accent)';
  enBtn.style.color      = isDa ? 'var(--muted)' : '#0a0a0a';
  daBtn.style.background = isDa ? 'var(--accent)' : 'transparent';
  daBtn.style.color      = isDa ? '#0a0a0a' : 'var(--muted)';
};

window.settingsToggleConstraint = (btn) => {
  const active = btn.dataset.active === 'true';
  btn.dataset.active = (!active).toString();
  btn.style.background = !active ? 'var(--surface-3)' : 'transparent';
  btn.style.color      = !active ? 'var(--text)' : 'var(--muted)';
};

window.saveSettings = () => {
  const raw = localStorage.getItem('bh_athlete_profile');
  const profile = raw ? JSON.parse(raw) : {};

  const nameEl = document.getElementById('settings-name');
  if (nameEl && nameEl.value.trim()) profile.personaName = nameEl.value.trim();

  const raceEl = document.getElementById('settings-race');
  if (raceEl) profile.targetRace = raceEl.value.trim();

  const planDayEl = document.getElementById('settings-planday');
  if (planDayEl) profile.weeklySessionDay = planDayEl.value;

  if (_settingsLang) {
    profile.language = _settingsLang;
    localStorage.setItem('bca_language', _settingsLang);
    window._language = _settingsLang;
    applyStaticTranslations();
  }

  const constraintBtns = document.querySelectorAll('#settings-constraints button');
  profile.fixedConstraints = Array.from(constraintBtns)
    .filter(b => b.dataset.active === 'true')
    .map(b => b.dataset.day);

  localStorage.setItem('bh_athlete_profile', JSON.stringify(profile));
  window._weeklySessionDay = profile.weeklySessionDay;
  window._fixedConstraints = profile.fixedConstraints;
  if (profile.personaName) {
    window._personaName = profile.personaName;
    updateCustomPersonaLabel();
  }

  const btn = document.querySelector('#settings-view button[onclick="saveSettings()"]');
  if (btn) { btn.textContent = '✓ Saved'; setTimeout(() => { btn.textContent = 'Save changes'; }, 1800); }
};

window.resetOnboarding = () => {
  Object.keys(localStorage)
    .filter(k => k.startsWith('bh_') || k.startsWith('bca_'))
    .forEach(k => localStorage.removeItem(k));
  location.reload();
};

// Prototype trigger — simulates app opening after a detected workout completion.
// In production this fires automatically via the wearable/fitness API integration.
// Targets today's first session by dayOrder; with no session planned, the
// rating mints a completed entity typed from the current phase.
window.simulateWorkoutComplete = () => {
  const today   = new Date();
  const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const target = sessionsForDay(dateKey).find(s => s.type !== 'Rest');
  if (target) {
    showSessionFeedbackPrompt(target, () => {}, { preload: false });
    return;
  }

  const phase   = document.getElementById('phase')?.value || 'Base Building';
  const typeMap = {
    'Early Base Building': 'Endurance', 'Base Building': 'Endurance',
    'Build Phase': 'Intensity', 'Peak Phase': 'Intensity',
    'Taper': 'Endurance', 'Recovery': 'Recovery',
    'Return to Training': 'Endurance', 'Off-season Maintenance': 'Endurance',
  };
  showFeedbackPrompt(dateKey, typeMap[phase] || 'Endurance', () => {}, { preload: false });
};
