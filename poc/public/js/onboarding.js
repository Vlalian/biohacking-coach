import { t } from './translations.js';

const LS_ONBOARDED  = 'bh_onboarded';
const LS_PROFILE    = 'bh_athlete_profile';
const PERSIST_PFX   = 'bca_';
const LS_IMPORTED   = 'bca_importedSessions';

const state = {
  name: '', language: 'English', experienceLevel: '', raceTarget: '',
  totalSteps: 6,
  // beginner adaptive
  sportBackground: [], weeklyHours: '', motivation: '',
  // intermediate adaptive
  bestTime: '', weakestDiscipline: [], hasHumanCoach: '',
  // veteran adaptive
  targetTime: '', trackedMetrics: [],
  // garmin (non-beginner only)
  importedSessions: [],
  // constraints
  fixedConstraints: [], weeklySessionDay: '',
};

export function isOnboarded() {
  return !!localStorage.getItem(LS_ONBOARDED);
}

export function getOnboardedProfile() {
  try { return JSON.parse(localStorage.getItem(LS_PROFILE) || 'null'); } catch { return null; }
}

const MONTH_MAP = {
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11,
  jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
};

function computePhase(raceTarget) {
  if (!raceTarget) return 'Base Building';
  const text = raceTarget.toLowerCase();
  let raceDate = null;

  // ISO date: 2026-06-01
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) { const d = new Date(iso[1]); if (!isNaN(d.getTime())) raceDate = d; }

  // "Month YYYY" or "Month, YYYY" — e.g. "June 2026", "jun 2026"
  if (!raceDate) {
    const my = text.match(/([a-z]+)[,\s]+(\d{4})/);
    if (my && MONTH_MAP[my[1]] !== undefined) {
      raceDate = new Date(parseInt(my[2]), MONTH_MAP[my[1]], 15);
    }
  }

  // Slash date: 01/06/2026 or 6/1/2026
  if (!raceDate) {
    const sl = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (sl) { const d = new Date(`${sl[3]}-${sl[2].padStart(2,'0')}-${sl[1].padStart(2,'0')}`); if (!isNaN(d.getTime())) raceDate = d; }
  }

  // Year only — assume mid-year
  if (!raceDate) {
    const yr = text.match(/\b(20\d{2})\b/);
    if (yr) raceDate = new Date(parseInt(yr[1]), 5, 15);
  }

  if (!raceDate || isNaN(raceDate.getTime())) return 'Base Building';
  const months = (raceDate - new Date()) / (1000 * 60 * 60 * 24 * 30.5);
  if (months < 0) return 'Recovery';
  if (months < 2) return 'Taper';
  if (months < 4) return 'Peak Phase';
  if (months < 6) return 'Build Phase';
  return 'Base Building';
}

function buildCommStyle() {
  const { name, experienceLevel, motivation, hasHumanCoach, trackedMetrics } = state;
  const n = name || 'The athlete';
  if (experienceLevel === 'beginner') {
    if (motivation === 'Performance') return `${n} is a first-timer with a performance mindset. Be direct and explain the reasoning behind training choices.`;
    if (motivation === 'Community') return `${n} is motivated by the community experience. Keep coaching warm and encouraging while being clear about expectations.`;
    return `${n} is a first-time Ironman athlete. Keep coaching encouraging and process-focused. Avoid jargon. Celebrate effort and consistency.`;
  }
  if (experienceLevel === 'intermediate') {
    const coached = hasHumanCoach === 'Yes' ? ' and works with a human coach' : '';
    return `${n} has 2–4 Ironman finishes${coached}. Respect their experience. Be direct and evidence-led. Focus on tactical adjustments rather than fundamentals.`;
  }
  if (experienceLevel === 'veteran') {
    const tracks = trackedMetrics.length > 0 && !trackedMetrics.includes('None') ? ` Tracks ${trackedMetrics.join(', ')}.` : '';
    return `${n} is a veteran Ironman athlete.${tracks} Use data-aware language. Be direct and performance-focused. Skip beginner explanations entirely.`;
  }
  return '';
}

// Map internal English option values → translation keys
const OPT_KEYS = {
  'Runner': 'optRunner', 'Cyclist': 'optCyclist', 'Swimmer': 'optSwimmer', 'Gym': 'optGym', 'None': 'optNone',
  'Under 3h': 'optUnder3', '3–6h': 'opt36', '6–10h': 'opt610', '10h+': 'opt10plus',
  'Completion': 'optCompletion', 'Personal challenge': 'optChallenge', 'Community': 'optCommunity', 'Performance': 'optPerformance',
  'Swim': 'optSwim', 'Bike': 'optBike', 'Run': 'optRun', 'Equal': 'optEqual',
  'Yes': 'optYes', 'No': 'optNo',
  'Heart Rate': 'optHR', 'Power': 'optPower', 'HRV': 'optHRV', 'Pace': 'optPace',
  'Flexible': 'optFlexible',
};
function tOpt(val) { return OPT_KEYS[val] ? t(OPT_KEYS[val]) : val; }

function el(id) { return document.getElementById(id); }
function render(html) { el('mcq-flow').innerHTML = html; }

const BTN_BASE   = 'padding:14px 16px;background:transparent;border:1px solid #282828;border-radius:10px;color:#a0a0a0;font-size:13px;font-weight:500;cursor:pointer;transition:all 0.12s;font-family:inherit;text-align:left;';
const BTN_HOVER  = `onmouseover="if(!this.dataset.on)this.style.borderColor='#444';if(!this.dataset.on)this.style.color='#e2e2e2'"
                    onmouseout="if(!this.dataset.on)this.style.borderColor='#282828';if(!this.dataset.on)this.style.color='#a0a0a0'"`;

function hdr(step) {
  return `<div style="font-size:10px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#6b6b6b;margin-bottom:14px;">${t('mcqStep')} ${step} ${t('mcqOf')} ${state.totalSteps}</div>`;
}

// ── Step 1: Language ──────────────────────────────────────────────────────────
function stepLanguage() {
  render(`
    <div>
      ${hdr(1)}
      <div style="font-size:15px;font-weight:600;color:#e2e2e2;margin-bottom:22px;">${t('mcqLanguage')}</div>
      <div style="display:flex;gap:10px;">
        ${['English', 'Dansk'].map(lang => `
          <button onclick="mcqSelectLanguage('${lang}')"
            style="flex:1;${BTN_BASE}" ${BTN_HOVER}>${lang}</button>
        `).join('')}
      </div>
    </div>
  `);
}

function mcqSelectLanguage(lang) {
  state.language     = lang;
  window._language   = lang;
  stepName();
}
window.mcqSelectLanguage = mcqSelectLanguage;

// ── Step 2: Name ──────────────────────────────────────────────────────────────
function stepName() {
  render(`
    <div>
      ${hdr(2)}
      <div style="font-size:15px;font-weight:600;color:#e2e2e2;margin-bottom:20px;">${t('mcqName')}</div>
      <input id="mcq-name" type="text" placeholder="${t('mcqNamePlaceholder')}" value="${state.name}" autocomplete="given-name"
        style="width:100%;background:#141414;border:1px solid #282828;border-radius:8px;color:#e2e2e2;font-size:14px;padding:12px;box-sizing:border-box;outline:none;font-family:inherit;"/>
      <div style="margin-top:14px;">
        <button id="mcq-name-btn" onclick="mcqNextName()" ${state.name ? '' : 'disabled'}
          style="width:100%;padding:14px;background:#c9a96e;border:none;border-radius:8px;color:#0a0a0a;font-size:13px;font-weight:700;cursor:pointer;opacity:${state.name ? '1' : '0.4'};">${t('mcqContinue')}</button>
      </div>
    </div>
  `);
  const input = el('mcq-name');
  input.focus();
  input.addEventListener('input', () => {
    const ok = input.value.trim().length > 0;
    const btn = el('mcq-name-btn');
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '0.4';
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mcqNextName(); } });
}

function mcqNextName() {
  const name = el('mcq-name')?.value.trim();
  if (!name) return;
  state.name = name;
  stepExperience();
}
window.mcqNextName = mcqNextName;

// ── Step 3: Experience ────────────────────────────────────────────────────────
function stepExperience() {
  const options = [
    { label: t('mcqExpOpt1'), value: 'beginner' },
    { label: t('mcqExpOpt2'), value: 'intermediate' },
    { label: t('mcqExpOpt3'), value: 'veteran' },
  ];
  render(`
    <div>
      ${hdr(3)}
      <div style="font-size:15px;font-weight:600;color:#e2e2e2;margin-bottom:6px;">${t('mcqExperience')}</div>
      <div style="font-size:12px;color:#6b6b6b;margin-bottom:22px;">${t('mcqExperienceSub')}</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${options.map(o => `<button onclick="mcqSelectExp('${o.value}')" style="width:100%;${BTN_BASE}" ${BTN_HOVER}>${o.label}</button>`).join('')}
      </div>
    </div>
  `);
}

function mcqSelectExp(level) {
  state.experienceLevel = level;
  state.totalSteps = level === 'beginner' ? 6 : 7;
  stepRace();
}
window.mcqSelectExp = mcqSelectExp;

// ── Step 4: Race target ───────────────────────────────────────────────────────
function stepRace() {
  render(`
    <div>
      ${hdr(4)}
      <div style="font-size:15px;font-weight:600;color:#e2e2e2;margin-bottom:6px;">${t('mcqRace')}</div>
      <div style="font-size:12px;color:#6b6b6b;margin-bottom:20px;">${t('mcqRaceSub')}</div>
      <input id="mcq-race" type="text" placeholder="${t('mcqRacePlaceholder')}" value="${state.raceTarget}"
        style="width:100%;background:#141414;border:1px solid #282828;border-radius:8px;color:#e2e2e2;font-size:14px;padding:12px;box-sizing:border-box;outline:none;font-family:inherit;"/>
      <div style="margin-top:14px;">
        <button id="mcq-race-btn" onclick="mcqNextRace()" ${state.raceTarget ? '' : 'disabled'}
          style="width:100%;padding:14px;background:#c9a96e;border:none;border-radius:8px;color:#0a0a0a;font-size:13px;font-weight:700;cursor:pointer;opacity:${state.raceTarget ? '1' : '0.4'};">${t('mcqContinue')}</button>
      </div>
    </div>
  `);
  const input = el('mcq-race');
  input.focus();
  input.addEventListener('input', () => {
    const ok = input.value.trim().length > 0;
    const btn = el('mcq-race-btn');
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '0.4';
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mcqNextRace(); } });
}

function mcqNextRace() {
  const race = el('mcq-race')?.value.trim();
  if (!race) return;
  state.raceTarget = race;
  stepAdaptive();
}
window.mcqNextRace = mcqNextRace;

// ── Step 5: Experience-adaptive questions ──────────────────────────────────────
function selectBtn(group, value) {
  state[group] = value;
  document.querySelectorAll(`[data-group="${group}"]`).forEach(btn => {
    const on = btn.dataset.value === value;
    btn.dataset.on = on ? '1' : '';
    btn.style.borderColor = on ? '#c9a96e' : '#282828';
    btn.style.color       = on ? '#c9a96e' : '#a0a0a0';
  });
}
window.mcqSelectGroup = selectBtn;

function toggleMultiArray(arr, value, noneKey) {
  if (value === noneKey) {
    return arr.includes(noneKey) ? [] : [noneKey];
  }
  const filtered = arr.filter(v => v !== noneKey);
  const idx = filtered.indexOf(value);
  if (idx === -1) filtered.push(value);
  else filtered.splice(idx, 1);
  return filtered;
}

function refreshMultiBtns(selector, dataAttr, arr) {
  document.querySelectorAll(selector).forEach(btn => {
    const on = arr.includes(btn.dataset[dataAttr]);
    btn.dataset.on = on ? '1' : '';
    btn.style.borderColor = on ? '#c9a96e' : '#282828';
    btn.style.color       = on ? '#c9a96e' : '#a0a0a0';
  });
}

function toggleSportBg(value) {
  state.sportBackground = toggleMultiArray(state.sportBackground, value, 'None');
  refreshMultiBtns('[data-sportbg]', 'sportbg', state.sportBackground);
}
window.mcqToggleSportBg = toggleSportBg;

function toggleWeakest(value) {
  state.weakestDiscipline = toggleMultiArray(state.weakestDiscipline, value, null);
  refreshMultiBtns('[data-weakest]', 'weakest', state.weakestDiscipline);
}
window.mcqToggleWeakest = toggleWeakest;

function toggleMetric(value) {
  state.trackedMetrics = toggleMultiArray(state.trackedMetrics, value, 'None');
  document.querySelectorAll('[data-metric]').forEach(btn => {
    const on = state.trackedMetrics.includes(btn.dataset.metric);
    btn.dataset.on = on ? '1' : '';
    btn.style.borderColor = on ? '#c9a96e' : '#282828';
    btn.style.color       = on ? '#c9a96e' : '#a0a0a0';
  });
}
window.mcqToggleMetric = toggleMetric;

function adaptiveBtns(group, opts) {
  return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
    ${opts.map(o => `<button data-group="${group}" data-value="${o}"
      onclick="mcqSelectGroup('${group}','${o}')"
      style="${BTN_BASE}padding:10px 14px;">${tOpt(o)}</button>`).join('')}
  </div>`;
}

function stepAdaptive() {
  let inner = '';
  if (state.experienceLevel === 'beginner') {
    const bgOpts = ['Runner', 'Cyclist', 'Swimmer', 'Gym', 'None'];
    inner = `
      <div style="font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;margin-bottom:8px;">${t('mcqSportBg')} <span style="font-weight:400;text-transform:none;letter-spacing:0;">${t('mcqOptionalMulti')}</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
        ${bgOpts.map(o => `<button data-sportbg="${o}" onclick="mcqToggleSportBg('${o}')"
          style="${BTN_BASE}padding:10px 14px;">${tOpt(o)}</button>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;margin-bottom:8px;">${t('mcqWeeklyHours')} <span style="font-weight:400;text-transform:none;letter-spacing:0;">${t('mcqOptional')}</span></div>
      ${adaptiveBtns('weeklyHours', ['Under 3h', '3–6h', '6–10h', '10h+'])}
      <div style="font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;margin-bottom:8px;">${t('mcqMotivation')} <span style="font-weight:400;text-transform:none;letter-spacing:0;">${t('mcqOptional')}</span></div>
      ${adaptiveBtns('motivation', ['Completion', 'Personal challenge', 'Community', 'Performance'])}
    `;
  } else if (state.experienceLevel === 'intermediate') {
    const wkOpts = ['Swim', 'Bike', 'Run', 'Equal'];
    inner = `
      <div style="font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;margin-bottom:8px;">${t('mcqBestTime')} <span style="font-weight:400;text-transform:none;letter-spacing:0;">${t('mcqOptional')}</span></div>
      <input id="mcq-besttime" type="text" placeholder="${t('mcqBestTimePlaceholder')}" value="${state.bestTime}"
        style="width:100%;background:#141414;border:1px solid #282828;border-radius:8px;color:#e2e2e2;font-size:13px;padding:10px;box-sizing:border-box;outline:none;font-family:inherit;margin-bottom:20px;"/>
      <div style="font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;margin-bottom:8px;">${t('mcqWeakest')} <span style="font-weight:400;text-transform:none;letter-spacing:0;">${t('mcqOptionalMulti')}</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
        ${wkOpts.map(o => `<button data-weakest="${o}" onclick="mcqToggleWeakest('${o}')"
          style="${BTN_BASE}padding:10px 14px;">${tOpt(o)}</button>`).join('')}
      </div>
      <div style="font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;margin-bottom:8px;">${t('mcqHumanCoach')}</div>
      ${adaptiveBtns('hasHumanCoach', ['Yes', 'No'])}
    `;
  } else {
    const metricOpts = ['Heart Rate', 'Power', 'HRV', 'Pace', 'None'];
    inner = `
      <div style="font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;margin-bottom:8px;">${t('mcqTargetTime')} <span style="font-weight:400;text-transform:none;letter-spacing:0;">${t('mcqOptional')}</span></div>
      <input id="mcq-targettime" type="text" placeholder="${t('mcqTargetTimePlaceholder')}" value="${state.targetTime}"
        style="width:100%;background:#141414;border:1px solid #282828;border-radius:8px;color:#e2e2e2;font-size:13px;padding:10px;box-sizing:border-box;outline:none;font-family:inherit;margin-bottom:20px;"/>
      <div style="font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;margin-bottom:8px;">${t('mcqMetrics')} <span style="font-weight:400;text-transform:none;letter-spacing:0;">${t('mcqOptionalMulti')}</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
        ${metricOpts.map(m => `<button data-metric="${m}" onclick="mcqToggleMetric('${m}')"
          style="${BTN_BASE}padding:10px 14px;">${tOpt(m)}</button>`).join('')}
      </div>
    `;
  }

  render(`
    <div>
      ${hdr(5)}
      <div style="font-size:15px;font-weight:600;color:#e2e2e2;margin-bottom:20px;">${t('mcqAboutYou')}</div>
      ${inner}
      <button onclick="mcqNextAdaptive()" style="width:100%;padding:14px;background:#c9a96e;border:none;border-radius:8px;color:#0a0a0a;font-size:13px;font-weight:700;cursor:pointer;">${t('mcqContinue')}</button>
    </div>
  `);
}

function mcqNextAdaptive() {
  if (el('mcq-besttime'))   state.bestTime   = el('mcq-besttime').value.trim();
  if (el('mcq-targettime')) state.targetTime = el('mcq-targettime').value.trim();
  state.experienceLevel === 'beginner' ? stepConstraints() : stepGarmin();
}
window.mcqNextAdaptive = mcqNextAdaptive;

// ── Step 6 (non-beginners): Garmin upload ──────────────────────────────────────
function stepGarmin() {
  render(`
    <div>
      ${hdr(6)}
      <div style="font-size:15px;font-weight:600;color:#e2e2e2;margin-bottom:6px;">${t('mcqGarminTitle')}</div>
      <div style="font-size:12px;color:#6b6b6b;margin-bottom:22px;">${t('mcqGarminSub')}</div>
      <label id="garmin-label" style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:#141414;border:1px dashed #282828;border-radius:10px;cursor:pointer;">
        <span style="color:#6b6b6b;font-size:22px;">↑</span>
        <span id="garmin-label-text" style="color:#a0a0a0;font-size:13px;">${t('mcqGarminChoose')}</span>
        <input id="garmin-file-input" type="file" accept=".fit,.gpx" multiple style="display:none;" onchange="mcqUploadGarmin(this)"/>
      </label>
      <div id="garmin-progress" style="margin-top:12px;min-height:20px;font-size:12px;color:#6b6b6b;"></div>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button onclick="mcqSkipGarmin()" style="flex:1;padding:14px;background:transparent;border:1px solid #282828;border-radius:8px;color:#6b6b6b;font-size:12px;cursor:pointer;">${t('mcqGarminSkip')}</button>
        <button id="garmin-next-btn" onclick="stepConstraints()" style="flex:2;padding:14px;background:#c9a96e;border:none;border-radius:8px;color:#0a0a0a;font-size:13px;font-weight:700;cursor:pointer;">${t('mcqContinue')}</button>
      </div>
    </div>
  `);
}

async function mcqUploadGarmin(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const lbl  = el('garmin-label-text');
  const prog = el('garmin-progress');
  lbl.textContent = `${files.length} file${files.length > 1 ? 's' : ''} selected`;
  prog.textContent = 'Uploading…';
  el('garmin-next-btn').disabled = true;

  try {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    const res     = await fetch('/api/garmin/upload', { method: 'POST', body: form });
    const { sessions } = await res.json();
    state.importedSessions = sessions || [];
    prog.style.color   = '#6db36d';
    prog.textContent   = `${state.importedSessions.length} session${state.importedSessions.length !== 1 ? 's' : ''} imported`;
  } catch {
    prog.style.color = '#d45a2a';
    prog.textContent = 'Upload failed — you can continue without it';
  }
  el('garmin-next-btn').disabled = false;
}
window.mcqUploadGarmin = mcqUploadGarmin;

function mcqSkipGarmin() { state.importedSessions = []; stepConstraints(); }
window.mcqSkipGarmin = mcqSkipGarmin;

// ── Step 6 (beginners) / Step 7 (non-beginners): Constraints + session day ───
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function toggleDay(day) {
  const idx = state.fixedConstraints.indexOf(day);
  if (idx === -1) state.fixedConstraints.push(day);
  else            state.fixedConstraints.splice(idx, 1);
  document.querySelectorAll('[data-day]').forEach(btn => {
    const on = state.fixedConstraints.includes(btn.dataset.day);
    btn.dataset.on    = on ? '1' : '';
    btn.style.borderColor = on ? '#d45a2a' : '#282828';
    btn.style.color       = on ? '#d45a2a' : '#a0a0a0';
  });
}
window.mcqToggleDay = toggleDay;

function stepConstraints() {
  const stepNum    = state.experienceLevel === 'beginner' ? 6 : 7;
  const weeklyOpts = ['Monday', 'Wednesday', 'Friday', 'Flexible'];
  const dayLabels  = t('days');
  render(`
    <div>
      ${hdr(stepNum)}
      <div style="font-size:15px;font-weight:600;color:#e2e2e2;margin-bottom:6px;">${t('mcqConstraintsTitle')}</div>
      <div style="font-size:12px;color:#6b6b6b;margin-bottom:16px;">${t('mcqConstraintsSub')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px;">
        ${DAYS.map((d, i) => `<button data-day="${d}" onclick="mcqToggleDay('${d}')"
          style="${BTN_BASE}padding:10px 14px;">${dayLabels[i]}</button>`).join('')}
      </div>
      <div style="font-size:15px;font-weight:600;color:#e2e2e2;margin-bottom:6px;">${t('mcqWeeklyDayTitle')}</div>
      <div style="font-size:12px;color:#6b6b6b;margin-bottom:16px;">${t('mcqWeeklyDaySub')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;">
        ${weeklyOpts.map(o => `<button data-group="weeklySessionDay" data-value="${o}"
          onclick="mcqSelectGroup('weeklySessionDay','${o}')"
          style="${BTN_BASE}padding:10px 14px;">${o === 'Flexible' ? tOpt(o) : dayLabels[DAYS.indexOf(o)]}</button>`).join('')}
      </div>
      <button onclick="mcqFinish()" style="width:100%;padding:14px;background:#c9a96e;border:none;border-radius:8px;color:#0a0a0a;font-size:13px;font-weight:700;cursor:pointer;">${t('mcqCompleteSetup')}</button>
    </div>
  `);
}
window.stepConstraints = stepConstraints;

// ── Completion ────────────────────────────────────────────────────────────────
function mcqFinish() {
  const apiKey    = el('onboardingApiKey')?.value.trim() || '';
  const phase     = computePhase(state.raceTarget);
  const commStyle = buildCommStyle();

  const profile = {
    personaName:      state.name,
    language:         state.language,
    experienceLevel:  state.experienceLevel,
    raceTarget:       state.raceTarget,
    phase,
    commStyle,
    fixedConstraints: state.fixedConstraints,
    weeklySessionDay: state.weeklySessionDay,
    // adaptive fields
    sportBackground:   state.sportBackground.length > 0   ? state.sportBackground   : null,
    weeklyHours:       state.weeklyHours       || null,
    motivation:        state.motivation        || null,
    bestTime:          state.bestTime          || null,
    weakestDiscipline: state.weakestDiscipline.length > 0 ? state.weakestDiscipline : null,
    hasHumanCoach:     state.hasHumanCoach     || null,
    targetTime:        state.targetTime        || null,
    trackedMetrics:    state.trackedMetrics.length > 0 ? state.trackedMetrics : null,
  };

  localStorage.setItem(LS_ONBOARDED, 'true');
  localStorage.setItem(LS_PROFILE,   JSON.stringify(profile));
  if (apiKey) localStorage.setItem(PERSIST_PFX + 'apiKey', apiKey);
  localStorage.setItem(PERSIST_PFX + 'experienceLevel', state.experienceLevel);
  localStorage.setItem(PERSIST_PFX + 'phase',           phase);
  localStorage.setItem(PERSIST_PFX + 'commStyle',       commStyle);
  localStorage.setItem(PERSIST_PFX + 'language',        state.language);
  if (state.importedSessions.length > 0) {
    localStorage.setItem(LS_IMPORTED, JSON.stringify(state.importedSessions));
  }

  const { intro, body } = coachGreeting(state.name || '', state.raceTarget || '');
  render(`
    <div style="padding:20px 0;">
      <div style="font-size:10px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#c9a96e;margin-bottom:16px;">Your Coach</div>
      <div style="font-size:15px;color:#e2e2e2;line-height:1.7;margin-bottom:10px;">${intro}</div>
      <div style="font-size:13px;color:#a8a8a8;line-height:1.6;margin-bottom:28px;">${body}</div>
      <button onclick="launchApp()" style="width:100%;padding:14px;background:#c9a96e;border:none;border-radius:8px;color:#0a0a0a;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">${t('mcqStartTraining')}</button>
    </div>
  `);
}
window.mcqFinish = mcqFinish;

export function coachGreeting(name, race) {
  const intro = name ? `Hello ${name}. I'm your Coach.` : `I'm your Coach.`;
  const body  = race ? `${race} is your target. Let's get to work.` : `Let's get to work.`;
  return { intro, body };
}

export function beginOnboarding() {
  el('onboarding-view').style.display = 'block';
  el('coach-view').style.display      = 'none';
  stepLanguage();
}

