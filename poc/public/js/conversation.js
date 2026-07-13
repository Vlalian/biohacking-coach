import { callNegotiate, callWeekly, callWeeklyPlan, callChat } from './api.js';
import { markDateUnavailable, getUnavailableDates, getWeekActivity, agreeWeeklyPlan as storeAgreeWeeklyPlan, weekStartOf, getDateKey } from './store.js';
import { t } from './translations.js';

function updateProfile(mutate) {
  const LS_PROFILE = 'bh_athlete_profile';
  try {
    const p = JSON.parse(localStorage.getItem(LS_PROFILE) || '{}');
    mutate(p);
    localStorage.setItem(LS_PROFILE, JSON.stringify(p));
    window._fixedConstraints = p.fixedConstraints || [];
  } catch {}
}

// Strip machine-readable signals from Coach reply, apply side-effects, return clean text.
function processConstraintSignals(reply) {
  // Single-instance unavailable date
  const unavailPattern = /\[UNAVAILABLE:(\d{4}-\d{2}-\d{2})\]/g;
  for (const m of [...reply.matchAll(unavailPattern)]) {
    markDateUnavailable(m[1]);
  }
  // Fixed constraint add
  const addPattern = /\[FIXED_CONSTRAINT_ADD:([A-Za-z]+)\]/g;
  for (const m of [...reply.matchAll(addPattern)]) {
    const day = m[1];
    updateProfile(p => {
      p.fixedConstraints = p.fixedConstraints || [];
      if (!p.fixedConstraints.includes(day)) p.fixedConstraints.push(day);
    });
  }
  // Fixed constraint remove
  const removePattern = /\[FIXED_CONSTRAINT_REMOVE:([A-Za-z]+)\]/g;
  for (const m of [...reply.matchAll(removePattern)]) {
    const day = m[1];
    updateProfile(p => {
      p.fixedConstraints = (p.fixedConstraints || []).filter(d => d !== day);
    });
  }
  return reply
    .replace(unavailPattern, '')
    .replace(addPattern, '')
    .replace(removePattern, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Conversation state ────────────────────────────────────────────────────────
// Owned here; never accessed directly from outside — use the exported functions.
let history       = [];
let weeklyHistory = [];
let chatHistory       = [];

// Which Weekly Session this is (1 = first meeting). Set when a session actually
// starts (first Coach reply received) and reused for every turn in that session,
// so the prompt arc never shifts mid-conversation.
let weeklySessionNumber = null;

function nextWeeklySessionNumber() {
  return parseInt(localStorage.getItem('bh_weekly_session_count') || '0', 10) + 1;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function addBubble(convoEl, role, text) {
  const div   = document.createElement('div');
  div.className = `bubble bubble-${role}`;
  div.innerHTML = `<div class="bubble-who">${role === 'coach' ? 'Coach' : 'Athlete'}</div>${escapeHtml(text)}`;
  convoEl.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return div;
}

function showLoading(convoEl) {
  const div   = document.createElement('div');
  div.className = 'loading';
  div.innerHTML = `<div class="dot"></div><div class="dot"></div><div class="dot"></div><span>${t('coachThinking')}</span>`;
  convoEl.appendChild(div);
  return div;
}

// Shared turn handler: reads input, renders bubbles, calls API, handles errors.
async function sendTurn(historyArr, callFn, { processSignals = false, onBeforeClear } = {}) {
  const input = document.getElementById('pushbackInput');
  const text  = input.value.trim();
  if (!text) return;

  const btn   = document.getElementById('sendBtn');
  const convo = document.getElementById('convo');
  btn.disabled = true;

  addBubble(convo, 'athlete', text);
  if (onBeforeClear) onBeforeClear(text);
  input.value = '';
  historyArr.push({ role: 'user', content: text });

  const loading = showLoading(convo);
  try {
    const apiKey = document.getElementById('apiKey').value.trim();
    const raw    = await callFn(apiKey);
    loading.remove();
    if (raw) {
      const reply = processSignals ? processConstraintSignals(raw) : raw;
      historyArr.push({ role: 'assistant', content: reply });
      addBubble(convo, 'coach', reply);
    }
  } catch (err) {
    loading.remove();
    addBubble(convo, 'coach', `Error: ${err.message}`);
  }

  btn.disabled = false;
}


function isAnyConversationActive() {
  return history.length > 0 || weeklyHistory.length > 0 || chatHistory.length > 0;
}

// Single source of truth for resetting the conversation UI.
// Clears both the main conversation and any open reflection, and restores
// button handlers to the default Session Negotiation (exception) mode.
function resetConversation() {
  history       = [];
  weeklyHistory = [];
  chatHistory   = [];
  document.getElementById('convo').innerHTML             = '';
  document.getElementById('convoCard').style.display     = 'block';
  document.getElementById('confirmedWrap').style.display = 'none';
  document.getElementById('pushbackWrap').style.display  = 'none';

  // Restore default card label and button handlers
  const label = document.getElementById('convoCard').querySelector('.card-label');
  if (label) label.textContent = t('sessionNegotiationLabel');

  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) { sendBtn.setAttribute('onclick', 'sendPushback()'); sendBtn.textContent = t('sendResponse'); }

  const confirmBtns = document.querySelectorAll('#pushbackWrap .btn-confirm');
  if (confirmBtns[0]) { confirmBtns[0].setAttribute('onclick', 'confirmSession()'); confirmBtns[0].textContent = t('confirmSession'); confirmBtns[0].style.display = 'none'; }

  const textarea = document.getElementById('pushbackInput');
  if (textarea) textarea.placeholder = t('pushbackPlaceholder');

  const notice = document.getElementById('chatPrivacyNotice');
  if (notice) notice.style.display = 'none';
}

let _confirmResolve = null;

// Shows an inline prompt asking whether to start fresh or keep the current chat.
// Resolves true if the user chooses to start new, false if they want to keep chatting.
// If a prompt is already showing, dismisses it (resolving keep-chatting) and shows a fresh one.
function confirmNewSession() {
  // Dismiss any existing banner so there's never more than one.
  const existing = document.getElementById('bh-confirm-banner');
  if (existing) {
    existing.remove();
    if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
  }

  return new Promise(resolve => {
    _confirmResolve = resolve;

    const convoCard = document.getElementById('convoCard');
    convoCard.style.display = 'block';
    convoCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const banner = document.createElement('div');
    banner.id = 'bh-confirm-banner';
    banner.style.cssText = `
      background: #1e1a12;
      border: 1px solid #c9a96e;
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 16px;
      font-size: 13px;
      color: #e2e2e2;
      line-height: 1.6;
    `;
    banner.innerHTML = `
      <div style="font-size:10px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#c9a96e;margin-bottom:8px;">Active conversation</div>
      You already have a conversation open. Start a new session recommendation, or keep chatting?
      <div style="display:flex;gap:10px;margin-top:14px;">
        <button id="btnKeepChat" style="flex:1;padding:10px;background:transparent;border:1px solid #282828;border-radius:8px;color:#6b6b6b;font-size:12px;font-weight:500;cursor:pointer;">Keep chatting</button>
        <button id="btnStartNew" style="flex:2;padding:10px;background:transparent;border:1px solid #c9a96e;border-radius:8px;color:#c9a96e;font-size:12px;font-weight:600;cursor:pointer;">Start new session</button>
      </div>
    `;

    const convo = document.getElementById('convo');
    convo.insertBefore(banner, convo.firstChild);

    banner.querySelector('#btnKeepChat').addEventListener('click', () => {
      banner.remove();
      _confirmResolve = null;
      resolve(false);
    });
    banner.querySelector('#btnStartNew').addEventListener('click', () => {
      banner.remove();
      _confirmResolve = null;
      resolve(true);
    });
  });
}

// ── Exported conversation actions ─────────────────────────────────────────────


export async function sendPushback(checkIn, sessionHistory) {
  await sendTurn(history, apiKey => callNegotiate(checkIn, history, apiKey, sessionHistory));
}


// ── Weekly Session ────────────────────────────────────────────────────────────

export async function startWeeklySession(checkIn, sessionHistory, weekFeedback, skippedSessions = []) {
  if (isAnyConversationActive()) {
    const startNew = await confirmNewSession();
    if (!startNew) return;
  }

  resetConversation(); // also clears weeklyHistory

  document.getElementById('convoCard').querySelector('.card-label').textContent = t('weeklySessionLabel');
  document.getElementById('pushbackInput').placeholder = t('weeklyPlaceholder');

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.setAttribute('onclick', 'sendWeeklyMessage()');
  sendBtn.textContent = t('send');

  const confirmBtn = document.querySelector('#pushbackWrap .btn-confirm');
  confirmBtn.setAttribute('onclick', 'agreeWeeklyPlan()');
  confirmBtn.textContent = t('agreeWeekPlan');
  confirmBtn.style.display = '';

  const convo   = document.getElementById('convo');
  const loading = showLoading(convo);

  try {
    const apiKey   = document.getElementById('apiKey').value.trim();
    if (!apiKey) { loading.remove(); alert('Please enter your Anthropic API key.'); return; }

    const firstMsg = { role: 'user', content: "Let's do our weekly session." };
    weeklyHistory.push(firstMsg);

    const wsNum = nextWeeklySessionNumber();
    const raw = await callWeekly({
      checkIn:          { ...checkIn, weeklySessionNumber: wsNum },
      messages:         weeklyHistory,
      apiKey,
      weekFeedback,
      sessionHistory,
      skippedSessions,
      unavailableDates: getUnavailableDates(),
      weekActivity:     getWeekActivity(),
    });
    loading.remove();
    if (raw) {
      // Session actually started — only now does it count as held.
      weeklySessionNumber = wsNum;
      localStorage.setItem('bh_weekly_session_count', String(wsNum));
      const reply = processConstraintSignals(raw);
      weeklyHistory.push({ role: 'assistant', content: reply });
      addBubble(convo, 'coach', reply);
      document.getElementById('pushbackWrap').style.display = 'block';
    }
  } catch (err) {
    loading.remove();
    const div = document.createElement('div');
    div.style.cssText = 'color:#8b2020;font-size:13px;padding:8px 0;';
    div.textContent = `Error: ${err.message}`;
    convo.appendChild(div);
  }
}

export async function sendWeeklyMessage(checkIn, sessionHistory, weekFeedback, skippedSessions = []) {
  // Same session number as the opening turn — falls back to the stored count
  // (the number persisted when this session started).
  const wsNum = weeklySessionNumber ?? Math.max(1, parseInt(localStorage.getItem('bh_weekly_session_count') || '1', 10));
  await sendTurn(weeklyHistory, apiKey => callWeekly({
    checkIn:          { ...checkIn, weeklySessionNumber: wsNum },
    messages:         weeklyHistory,
    apiKey,
    weekFeedback,
    sessionHistory,
    skippedSessions,
    unavailableDates: getUnavailableDates(),
    weekActivity:     getWeekActivity(),
  }), {
    processSignals: true,
  });
}

export async function agreeWeeklyPlan() {
  document.getElementById('pushbackWrap').style.display  = 'none';
  document.getElementById('confirmedWrap').style.display = 'block';
  document.getElementById('confirmedText').innerHTML =
    `<span style="color:var(--green);font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">${t('weekPlanAgreed')}</span>` +
    `<div style="margin-top:10px;font-size:13px;color:var(--muted);">${t('weekPlanMessage')}</div>`;
  document.getElementById('confirmedWrap').scrollIntoView({ behavior: 'smooth' });

  // Extract the structured plan silently and land it in the session store.
  // Past weeks need no archiving — their sessions are already entities.
  try {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (apiKey && weeklyHistory.length > 0) {
      const sessions = await callWeeklyPlan(weeklyHistory, apiKey);
      if (sessions) {
        storeAgreeWeeklyPlan(weekStartOf(getDateKey(new Date())), sessions);
      }
    }
  } catch { /* silent — the calendar keeps showing the stored sessions */ }
}

// ── Coach Chat ────────────────────────────────────────────────────────────────

export async function startCoachChat(checkIn) {
  if (isAnyConversationActive()) {
    const startNew = await confirmNewSession();
    if (!startNew) return;
  }

  resetConversation();

  document.getElementById('convoCard').querySelector('.card-label').textContent = t('coachChatLabel');
  document.getElementById('pushbackInput').placeholder = t('chatPlaceholder');

  const sendBtn = document.getElementById('sendBtn');
  sendBtn.setAttribute('onclick', 'sendChatMessage()');
  sendBtn.textContent = t('send');

  const confirmBtns = document.querySelectorAll('#pushbackWrap .btn-confirm');
  if (confirmBtns[0]) { confirmBtns[0].setAttribute('onclick', 'endCoachChat()'); confirmBtns[0].textContent = t('endCoachChat'); confirmBtns[0].style.display = ''; }

  const notice = document.getElementById('chatPrivacyNotice');
  if (notice) notice.style.display = 'block';

  document.getElementById('convoCard').style.display = 'block';
  document.getElementById('pushbackWrap').style.display = 'block';
  document.getElementById('convoCard').scrollIntoView({ behavior: 'smooth' });
}

export async function sendChatMessage(checkIn) {
  await sendTurn(chatHistory, apiKey => callChat(chatHistory, apiKey, checkIn), {
    processSignals: true,
  });
}

export function endCoachChat() {
  resetConversation();
  document.getElementById('convoCard').style.display = 'none';
}

// Handles a session tapped from the Training Plan calendar.
// Receives a typed sessionCtx object dispatched by calendar.js — no window globals.
export async function discussWithCoach(checkIn, sessionHistory, sessionCtx) {
  const hasMainConversation = history.length > 0;

  if (isAnyConversationActive() && !hasMainConversation) {
    const startNew = await confirmNewSession();
    if (!startNew) return;
  }

  if (!hasMainConversation) resetConversation();

  const convo   = document.getElementById('convo');
  const userMsg = `I want to talk about my ${sessionCtx.type} session on ${sessionCtx.dayLabel}.`;
  addBubble(convo, 'athlete', userMsg);
  history.push({ role: 'user', content: userMsg });

  const loading = showLoading(convo);
  try {
    const apiKey = document.getElementById('apiKey').value.trim();
    const reply  = await callNegotiate(checkIn, history, apiKey, sessionHistory, sessionCtx);
    loading.remove();
    if (reply) {
      history.push({ role: 'assistant', content: reply });
      addBubble(convo, 'coach', reply);
      document.getElementById('pushbackWrap').style.display = 'block';
    }
  } catch (err) {
    loading.remove();
    addBubble(convo, 'coach', `Error: ${err.message}`);
  }
}
