# Deleted: Session Negotiation dead code
Removed 2026-06-26. Restore by putting each block back in the indicated file.

---

## conversation.js — imports removed

```js
// Line 1 — replace with:
import { callNegotiate, callSendoff, callReflect, callWeekly, callWeeklyPlan, callChat } from './api.js';
```

## conversation.js — arrays removed

```js
let pushbacks         = [];
let reflectionHistory = [];
```

## conversation.js — logPushback() removed

```js
function logPushback(text) {
  pushbacks.push(text);
  document.getElementById('logCard').style.display = 'block';
  const entries = document.getElementById('logEntries');
  const div     = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<div class="log-meta">Pushback #${pushbacks.length}</div>${escapeHtml(text)}`;
  entries.appendChild(div);
}
```

## conversation.js — getRecommendation() removed

```js
export async function getRecommendation(checkIn, sessionHistory) {
  if (isAnyConversationActive()) {
    const startNew = await confirmNewSession();
    if (!startNew) return;
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled    = true;
  btn.textContent = 'Getting recommendation...';

  resetConversation();
  const convo   = document.getElementById('convo');
  const loading = showLoading(convo);

  try {
    const apiKey  = document.getElementById('apiKey').value.trim();
    if (!apiKey) { alert('Please enter your Anthropic API key.'); loading.remove(); return; }

    const firstMsg = { role: 'user', content: 'Give me my session recommendation.' };
    history.push(firstMsg);

    const reply = await callNegotiate(checkIn, history, apiKey, sessionHistory);
    loading.remove();
    if (reply) {
      history.push({ role: 'assistant', content: reply });
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

  btn.disabled    = false;
  btn.textContent = 'Get Session Recommendation';
}
```

## conversation.js — sendPushback onBeforeClear removed

Original had `onBeforeClear: text => logPushback(text)` in the sendTurn call:

```js
export async function sendPushback(checkIn, sessionHistory) {
  await sendTurn(history, apiKey => callNegotiate(checkIn, history, apiKey, sessionHistory), {
    onBeforeClear: text => logPushback(text),
  });
}
```

## conversation.js — requestProjection() removed

```js
// Trajectory Projection: sends directly — does NOT log as Pushback Rationale.
// A projection request is not a pushback by domain definition; logging it as one
// would corrupt the Pushback Rationale data used by Reliance Calibration.
export async function requestProjection(checkIn, sessionHistory) {
  const msg   = 'Where am I headed with my training? Can you show me a projection?';
  const convo = document.getElementById('convo');
  addBubble(convo, 'athlete', msg);
  history.push({ role: 'user', content: msg });

  const loading = showLoading(convo);
  try {
    const apiKey = document.getElementById('apiKey').value.trim();
    const reply  = await callNegotiate(checkIn, history, apiKey, sessionHistory);
    loading.remove();
    if (reply) {
      history.push({ role: 'assistant', content: reply });
      addBubble(convo, 'coach', reply);
    }
  } catch (err) {
    loading.remove();
    addBubble(convo, 'coach', `Error: ${err.message}`);
  }
}
```

## conversation.js — confirmSession() removed

```js
export async function confirmSession(checkIn) {
  document.getElementById('pushbackWrap').style.display  = 'none';
  document.getElementById('confirmedWrap').style.display = 'block';

  const lastCoach = [...history].reverse().find(m => m.role === 'assistant');
  document.getElementById('confirmedText').innerHTML = escapeHtml(lastCoach?.content || '');
  document.getElementById('confirmedWrap').scrollIntoView({ behavior: 'smooth' });

  const sendoffEl = document.getElementById('sendoffText');
  sendoffEl.textContent = 'Coach is writing...';

  try {
    const apiKey = document.getElementById('apiKey').value.trim();
    const reply  = await callSendoff(checkIn, apiKey);
    sendoffEl.textContent = reply || '';
    document.getElementById('returnBtn').style.display = 'block';
  } catch (err) {
    sendoffEl.textContent = '';
  }
}
```

## conversation.js — startReflection() removed

```js
export async function startReflection(checkIn) {
  reflectionHistory = [];
  document.getElementById('returnBtn').style.display     = 'none';
  document.getElementById('reflectionCard').style.display = 'block';
  document.getElementById('reflectionCard').scrollIntoView({ behavior: 'smooth' });

  const convo   = document.getElementById('reflectionConvo');
  convo.innerHTML = '';
  const loading = showLoading(convo);

  try {
    const firstMsg = { role: 'user', content: "I'm back from training." };
    reflectionHistory.push(firstMsg);
    const apiKey = document.getElementById('apiKey').value.trim();
    const reply  = await callReflect(checkIn, reflectionHistory, apiKey);
    loading.remove();
    if (reply) {
      reflectionHistory.push({ role: 'assistant', content: reply });
      addBubble(convo, 'coach', reply);
      document.getElementById('reflectionInputWrap').style.display = 'block';
    }
  } catch (err) {
    loading.remove();
  }
}
```

## conversation.js — sendReflection() removed

```js
export async function sendReflection(checkIn) {
  const input = document.getElementById('reflectionInput');
  const text  = input.value.trim();
  if (!text) return;

  const btn = document.getElementById('reflectionSendBtn');
  btn.disabled = true;
  input.value  = '';

  const convo = document.getElementById('reflectionConvo');
  addBubble(convo, 'athlete', text);
  reflectionHistory.push({ role: 'user', content: text });

  const loading = showLoading(convo);
  try {
    const apiKey = document.getElementById('apiKey').value.trim();
    const reply  = await callReflect(checkIn, reflectionHistory, apiKey);
    loading.remove();
    if (reply) {
      reflectionHistory.push({ role: 'assistant', content: reply });
      addBubble(convo, 'coach', reply);
    }
  } catch (err) {
    loading.remove();
  }

  btn.disabled = false;
}
```

## conversation.js — closeReflection() removed

```js
export function closeReflection() {
  document.getElementById('reflectionInputWrap').style.display = 'none';
  document.getElementById('reflectionDone').style.display      = 'block';
}
```

---

## app.js — import line (original)

```js
import {
  getRecommendation, sendPushback, requestProjection,
  confirmSession, startReflection, sendReflection, closeReflection,
  discussWithCoach, startWeeklySession, sendWeeklyMessage, agreeWeeklyPlan,
  startCoachChat, sendChatMessage, endCoachChat,
} from './conversation.js';
```

## app.js — reflectionInput keydown listener removed

```js
document.getElementById('reflectionInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReflection(readCheckIn()); }
});
```

## app.js — window bindings removed

```js
window.getRecommendation  = () => getRecommendation(readCheckIn(), sessionHistory);
window.requestProjection  = () => requestProjection(readCheckIn(), sessionHistory);
window.confirmSession     = () => confirmSession(readCheckIn());
window.startReflection    = () => startReflection(readCheckIn());
window.sendReflection     = () => sendReflection(readCheckIn());
window.closeReflection    = closeReflection;
```

Note: `window.sendPushback` kept — still used as default send handler for discussWithCoach.

---

## index.html — logCard removed (was after pushbackWrap)

```html
<!-- Pushback log -->
<div class="card" id="logCard" style="display:none;">
  <div class="log-label">Pushback Rationale Log</div>
  <div id="logEntries"></div>
</div>
```

## index.html — sendoffText + returnBtn removed (from confirmedWrap)

```html
<div id="sendoffText" style="margin-top:14px; color:var(--text);"></div>
<button class="btn-return" id="returnBtn" style="display:none;" onclick="simulateWorkoutComplete()">
  Rate this session
</button>
```

## index.html — requestProjection button removed (from pushbackWrap)

```html
<button class="btn-confirm" onclick="requestProjection()" style="color:var(--accent);border-color:var(--accent-dim);">&#8594; Where am I headed?</button>
```

## index.html — reflectionCard removed

```html
<!-- Session Reflection -->
<div class="reflection-card" id="reflectionCard" style="display:none;">
  <div class="card-label">Session Reflection</div>
  <div id="reflectionConvo"></div>
  <div id="reflectionInputWrap" style="display:none; margin-top:20px;">
    <textarea id="reflectionInput" rows="3"
      placeholder="How did it go... (Enter to send)"></textarea>
    <div class="pushback-actions" style="margin-top:10px;">
      <button class="btn-confirm" onclick="closeReflection()">Done</button>
      <button class="btn-send" id="reflectionSendBtn" onclick="sendReflection()">Send</button>
    </div>
  </div>
  <div id="reflectionDone" style="display:none; margin-top:16px; font-size:12px; color:var(--muted); letter-spacing:0.08em; text-transform:uppercase;">Reflection closed</div>
</div>
```
