// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../public/js/api.js', () => ({
  callNegotiate:  vi.fn().mockResolvedValue(''),
  callWeekly:     vi.fn().mockResolvedValue('Opening message from coach.'),
  callWeeklyPlan: vi.fn().mockResolvedValue([]),
  callChat:       vi.fn().mockResolvedValue(''),
}));

import { startWeeklySession, startCoachChat } from '../public/js/conversation.js';

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
  beforeEach(buildDOM);

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
  beforeEach(buildDOM);

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
