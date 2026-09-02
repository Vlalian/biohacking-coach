import { describe, it, expect } from 'vitest';
import type { Message } from '@/features/coach/conversation';
import { TRUST_SIGNAL_QUESTION } from './feedback-prompt';
import { shouldAskTrustSignal, trustSignalState, TRUST_SIGNAL_AFTER_TURNS } from './feedback';

function turn(role: Message['role'], seq: number, content = 'x'): Message {
  return {
    id: `m${seq}`,
    role,
    content,
    seq,
    createdAt: new Date('2026-09-01T09:00:00Z'),
  };
}

/** A transcript of `n` completed exchanges: the tester speaks, the interviewer answers. */
function exchanges(n: number): Message[] {
  return Array.from({ length: n }, (_, i) => [
    turn('athlete', i * 2),
    turn('coach_ai', i * 2 + 1),
  ]).flat();
}

describe('shouldAskTrustSignal', () => {
  it('does not ask on the tester’s first turn', () => {
    // "Near the end" is the whole specification (CONTEXT.md). Asking the Trust
    // Signal before the tester has said anything specific gets the yes/no that
    // CONTEXT.md says is worth least.
    expect(shouldAskTrustSignal(1, false)).toBe(false);
  });

  it('does not ask while the interview is still short of the threshold', () => {
    expect(shouldAskTrustSignal(TRUST_SIGNAL_AFTER_TURNS - 1, false)).toBe(false);
  });

  it('asks once the interview has run its course', () => {
    expect(shouldAskTrustSignal(TRUST_SIGNAL_AFTER_TURNS, false)).toBe(true);
  });

  it('keeps asking on later turns while it is still unanswered', () => {
    // The tester can dodge the question, or the turn can fail. It stays due
    // until an answer actually exists — it is asked once, not offered once.
    expect(shouldAskTrustSignal(TRUST_SIGNAL_AFTER_TURNS + 4, false)).toBe(true);
  });

  it('never asks again once it has been asked or answered', () => {
    // "Asked once" is the contract. A second ask would overwrite nothing (the
    // unique index refuses it) but would waste the end of the interview.
    expect(shouldAskTrustSignal(TRUST_SIGNAL_AFTER_TURNS + 4, true)).toBe(false);
  });

  it('does not ask before the tester has spoken at all', () => {
    expect(shouldAskTrustSignal(0, false)).toBe(false);
  });
});

describe('trustSignalState', () => {
  it('counts the turn being sent, not just the stored ones', () => {
    // The decision is made while rendering the prompt for *this* turn, so the
    // message in flight counts. One fewer stored exchange than the threshold is
    // therefore already enough.
    const state = trustSignalState(exchanges(TRUST_SIGNAL_AFTER_TURNS - 1), false);

    expect(state.askNow).toBe(true);
  });

  it('does not ask before the tester has said enough', () => {
    expect(trustSignalState(exchanges(1), false).askNow).toBe(false);
  });

  it('counts the tester’s turns, not the interviewer’s', () => {
    // An interviewer that answers twice in a row must not push the tester over
    // the threshold — the question is about how much *they* have said.
    const lopsided = [
      turn('athlete', 0),
      turn('coach_ai', 1),
      turn('coach_ai', 2),
      turn('coach_ai', 3),
      turn('coach_ai', 4),
    ];

    expect(trustSignalState(lopsided, false).askNow).toBe(false);
  });

  it('reads the tester’s turn as the answer when the interviewer just asked', () => {
    // How the answer is recognised at all: the question is in the interviewer's
    // last turn, so whatever the tester says next is the answer to it.
    const asked = [
      ...exchanges(3),
      turn('athlete', 100),
      turn('coach_ai', 101, `Fair. ${TRUST_SIGNAL_QUESTION}`),
    ];

    expect(trustSignalState(asked, false).answering).toBe(true);
  });

  it('does not re-ask on the turn it is being answered', () => {
    const asked = [
      ...exchanges(3),
      turn('athlete', 100),
      turn('coach_ai', 101, `Fair. ${TRUST_SIGNAL_QUESTION}`),
    ];

    expect(trustSignalState(asked, false).askNow).toBe(false);
  });

  it('is not answering when the interviewer’s last turn asked something else', () => {
    expect(trustSignalState(exchanges(4), false).answering).toBe(false);
  });

  it('reads the question only in the interviewer’s turn, never the tester’s', () => {
    // A tester who quotes the question back — "you asked whether I would have
    // done something different if I'd decided alone" — has not been asked it.
    // Their next turn is not an answer, and storing it as one would put their
    // own words in the column the Trust Signal is read from.
    const quotedByTester = [
      ...exchanges(3),
      turn('coach_ai', 100, 'Which session was that?'),
      turn('athlete', 101, `you already asked me: ${TRUST_SIGNAL_QUESTION}`),
    ];

    expect(trustSignalState(quotedByTester, false).answering).toBe(false);
  });

  it('is not answering when the interviewer has not spoken at all', () => {
    // The tester's very first turn, before any reply exists. There is no
    // question for it to be the answer to.
    const onlyTester = [turn('athlete', 0), turn('athlete', 1)];

    expect(trustSignalState(onlyTester, false).answering).toBe(false);
  });

  it('is neither asking nor answering once an answer exists', () => {
    // The stored answer is what closes it. A second one could not be written
    // anyway — the partial unique index refuses it.
    const asked = [
      ...exchanges(3),
      turn('coach_ai', 101, `Fair. ${TRUST_SIGNAL_QUESTION}`),
    ];

    expect(trustSignalState(asked, true)).toEqual({ askNow: false, answering: false });
  });
});
