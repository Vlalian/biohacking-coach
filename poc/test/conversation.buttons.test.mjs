// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../public/js/api.js', () => ({
  callNegotiate:  vi.fn().mockResolvedValue(''),
  callWeekly:     vi.fn().mockResolvedValue('Opening message from coach.'),
  callWeeklyPlan: vi.fn().mockResolvedValue([]),
  callChat:       vi.fn().mockResolvedValue(''),
}));

// conversation.js keeps conversation state at module level, so each test gets a
// fresh module instance — otherwise a prior test's history triggers the
// confirm-new-session banner, which awaits a click that never comes.
let startWeeklySession, startCoachChat, sendWeeklyMessage;

beforeEach(async () => {
  vi.resetModules();
  ({ startWeeklySession, startCoachChat, sendWeeklyMessage } = await import('../public/js/conversation.js'));
  Element.prototype.scrollIntoView = vi.fn(); // not implemented in jsdom
  vi.clearAllMocks();      // mock call lists persist across tests otherwise
  localStorage.clear();    // so does jsdom localStorage
  buildDOM();
});

const CHECKIN = {
  body: 7, mental: 7, energy: 7, sleep: 7, pulse: 50,
  phase: 'Base Building', personaName: 'Mads', commStyle: '',
  language: 'English', weeklySessionDay: 'Monday',
  fixedConstraints: [], equipment: {}, weeklySessionNumber: 1,
};

function buildDOM() {
  document.body.innerHTML = `
    <div id="convoCard">
      <span class="card-label"></span>
      <div id="convo"></div>
    </div>
    <div id="confirmedWrap" style="display:none;"></div>
    <div id="pushbackWrap" style="display:none;">
      <input id="pushbackInput" />
      <button id="sendBtn"></button>
      <button class="btn-confirm" style="display:none;"></button>
    </div>
    <div id="chatPrivacyNotice" style="display:none;"></div>
    <input id="apiKey" value="test-api-key" />
  `;
}

describe('startWeeklySession — agree button', () => {
  it('shows the confirm button', async () => {
    await startWeeklySession(CHECKIN, [], [], []);
    expect(document.querySelector('#pushbackWrap .btn-confirm').style.display).toBe('');
  });

  it('wires onclick to agreeWeeklyPlan', async () => {
    await startWeeklySession(CHECKIN, [], [], []);
    expect(document.querySelector('#pushbackWrap .btn-confirm').getAttribute('onclick'))
      .toBe('agreeWeeklyPlan()');
  });

  it('shows pushbackWrap after coach response', async () => {
    await startWeeklySession(CHECKIN, [], [], []);
    expect(document.getElementById('pushbackWrap').style.display).toBe('block');
  });
});

describe('startCoachChat — end-chat button', () => {
  it('shows the confirm button', async () => {
    await startCoachChat(CHECKIN);
    expect(document.querySelector('#pushbackWrap .btn-confirm').style.display).toBe('');
  });

  it('wires onclick to endCoachChat', async () => {
    await startCoachChat(CHECKIN);
    expect(document.querySelector('#pushbackWrap .btn-confirm').getAttribute('onclick'))
      .toBe('endCoachChat()');
  });
});

describe('startWeeklySession — session numbering', () => {
  it('counts the session once the coach replies', async () => {
    localStorage.removeItem('bh_weekly_session_count');
    await startWeeklySession(CHECKIN, [], [], []);
    expect(localStorage.getItem('bh_weekly_session_count')).toBe('1');
  });

  it('sends weeklySessionNumber 1 on a fresh start', async () => {
    localStorage.removeItem('bh_weekly_session_count');
    const { callWeekly } = await import('../public/js/api.js');
    await startWeeklySession(CHECKIN, [], [], []);
    expect(callWeekly.mock.calls[0][0].weeklySessionNumber).toBe(1);
  });

  it('does not count a session when the API call fails', async () => {
    localStorage.removeItem('bh_weekly_session_count');
    const { callWeekly } = await import('../public/js/api.js');
    callWeekly.mockRejectedValueOnce(new Error('network down'));
    await startWeeklySession(CHECKIN, [], [], []);
    expect(localStorage.getItem('bh_weekly_session_count')).toBeNull();
  });

  it('does not count a session when the API key is missing', async () => {
    localStorage.removeItem('bh_weekly_session_count');
    document.getElementById('apiKey').value = '';
    window.alert = vi.fn();
    await startWeeklySession(CHECKIN, [], [], []);
    expect(localStorage.getItem('bh_weekly_session_count')).toBeNull();
  });

  it('follow-up turns keep the same session number (arc never shifts mid-conversation)', async () => {
    localStorage.removeItem('bh_weekly_session_count');
    const { callWeekly } = await import('../public/js/api.js');
    await startWeeklySession(CHECKIN, [], [], []);
    document.getElementById('pushbackInput').value = 'Sounds good, but Tuesday is tricky.';
    await sendWeeklyMessage(CHECKIN, [], [], []);
    expect(callWeekly.mock.calls[1][0].weeklySessionNumber).toBe(1);
  });
});
