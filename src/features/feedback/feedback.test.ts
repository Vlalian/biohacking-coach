import { describe, it, expect } from 'vitest';
import type { Message } from '@/features/coach/conversation';
import { TRUST_SIGNAL_QUESTION } from './feedback-prompt';
import {
  knownFailureReason,
  submittedFromView,
  trustSignalState,
  TRUST_SIGNAL_AFTER_TURNS,
} from './feedback';

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

describe('trustSignalState — when it asks', () => {
  it('counts the turn being sent, not just the stored ones', () => {
    // The decision is made while rendering the prompt for *this* turn, so the
    // message in flight counts. One fewer stored exchange than the threshold is
    // therefore already enough.
    const state = trustSignalState(exchanges(TRUST_SIGNAL_AFTER_TURNS - 1), false);

    expect(state.askNow).toBe(true);
  });

  it('does not ask before the tester has said enough', () => {
    // "Near the end" is the whole specification (CONTEXT.md). Asking the Trust
    // Signal before the tester has said anything specific gets the yes/no that
    // CONTEXT.md says is worth least.
    expect(trustSignalState(exchanges(1), false).askNow).toBe(false);
  });

  it('does not ask on the tester’s very first turn', () => {
    expect(trustSignalState([], false).askNow).toBe(false);
  });

  it('asks on exactly one turn, never again on later ones', () => {
    // The regression this replaced: the ask used to stay due until an answer was
    // recognised, and recognition depended on the model repeating the question
    // word for word. A paraphrase — which the prompt invites — meant "once, near
    // the end" silently became every turn from the third onward.
    for (const extra of [1, 2, 5]) {
      const later = exchanges(TRUST_SIGNAL_AFTER_TURNS - 1 + extra);

      expect(trustSignalState(later, false).askNow).toBe(false);
    }
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
});

describe('trustSignalState — when it is being answered', () => {
  it('reads the tester’s next turn as the answer', () => {
    // How the answer is recognised at all: the ask went out on the turn that
    // reached the threshold, so the turn after it is the answer to it.
    const asked = exchanges(TRUST_SIGNAL_AFTER_TURNS);

    expect(trustSignalState(asked, false).answering).toBe(true);
  });

  it('does not re-ask on the turn it is being answered', () => {
    expect(trustSignalState(exchanges(TRUST_SIGNAL_AFTER_TURNS), false).askNow).toBe(false);
  });

  it('is not answering before the ask has gone out', () => {
    expect(trustSignalState(exchanges(TRUST_SIGNAL_AFTER_TURNS - 1), false).answering).toBe(
      false,
    );
  });

  it('is not answering on turns after the one that followed the ask', () => {
    // Only the turn directly after the ask is the answer. A tester still talking
    // four turns later is not answering a question that was asked and passed.
    expect(trustSignalState(exchanges(TRUST_SIGNAL_AFTER_TURNS + 2), false).answering).toBe(
      false,
    );
  });

  it('does not depend on the interviewer repeating the question verbatim', () => {
    // The point of deciding by position: the prompt tells the model to work the
    // question in naturally, so its wording is not something this module can
    // match on. A paraphrased ask is still an ask.
    const paraphrased = [
      ...exchanges(TRUST_SIGNAL_AFTER_TURNS - 1),
      turn('athlete', 100),
      turn('coach_ai', 101, 'And if nobody had told you — same call?'),
    ];

    expect(trustSignalState(paraphrased, false).answering).toBe(true);
  });

  it('is not answering when a tester quotes the question back early', () => {
    // A tester who says "you asked whether I would have done something different
    // if I'd decided alone" has not been asked it. Their own words must not land
    // in the column the Trust Signal is read from.
    const quotedByTester = [
      turn('athlete', 0, `you already asked me: ${TRUST_SIGNAL_QUESTION}`),
      turn('coach_ai', 1),
    ];

    expect(trustSignalState(quotedByTester, false).answering).toBe(false);
  });

  it('is neither asking nor answering once an answer exists', () => {
    // The stored answer is what closes it. A second one could not be written
    // anyway — the partial unique index refuses it.
    expect(trustSignalState(exchanges(TRUST_SIGNAL_AFTER_TURNS), true)).toEqual({
      askNow: false,
      answering: false,
    });
  });
});

describe('trustSignalState counts only the tester', () => {
  it('does not count the interviewer toward the threshold', () => {
    // Two tester turns stored plus the one in flight is the threshold. The
    // interviewer's single reply must not be what makes up the difference — the
    // question is about how much *they* have said.
    const unbalanced = [turn('athlete', 0), turn('coach_ai', 1), turn('athlete', 2)];

    expect(trustSignalState(unbalanced, false).askNow).toBe(true);
  });

  it('does not count the interviewer when reading the answer either', () => {
    const unbalanced = [
      turn('athlete', 0),
      turn('coach_ai', 1),
      turn('athlete', 2),
      turn('athlete', 3),
      turn('coach_ai', 4, 'And if nobody had told you — same call?'),
    ];

    expect(trustSignalState(unbalanced, false).answering).toBe(true);
  });
});

describe('knownFailureReason', () => {
  it('keeps a reason this app actually produces', () => {
    expect(knownFailureReason('coach-unavailable')).toBe('coach-unavailable');
    expect(knownFailureReason('consent-required')).toBe('consent-required');
  });

  it('refuses anything else, including a reason from another surface', () => {
    // The client supplies this, and it lands in a column someone will group by.
    // `unsafe-content` is a real refusal elsewhere in the app and still not one
    // this page can produce, so it is not a reason a row here may carry.
    expect(knownFailureReason('unsafe-content')).toBeNull();
    expect(knownFailureReason('anything at all')).toBeNull();
    expect(knownFailureReason(null)).toBeNull();
  });
});

describe('submittedFromView', () => {
  it('keeps a View path', () => {
    expect(submittedFromView('/training-plan')).toBe('/training-plan');
    expect(submittedFromView('/coach/athlete/abc_1/plan')).toBe('/coach/athlete/abc_1/plan');
    expect(submittedFromView('/')).toBe('/');
  });

  it('refuses anything that is not shaped like a path', () => {
    // The escape hatch's own link supplies this, so it is client-supplied by
    // construction. A column read for context is worth having; a column a client
    // can write prose into is not.
    expect(submittedFromView('training-plan')).toBeNull();
    expect(submittedFromView('the calendar never loaded')).toBeNull();
    expect(submittedFromView('/path with spaces')).toBeNull();
    expect(submittedFromView('https://example.com/phish')).toBeNull();
  });

  it('refuses a path longer than a path has any reason to be', () => {
    expect(submittedFromView(`/${'a'.repeat(64)}`)).toBeNull();
    expect(submittedFromView(`/${'a'.repeat(63)}`)).not.toBeNull();
  });

  it('refuses a non-string that merely stringifies to a path', () => {
    // What the `typeof` guard is for. `RegExp.test` coerces its argument, so an
    // array holding one path-shaped string matches the pattern — and without the
    // guard it would be the array, not a string, that reached the column.
    expect(submittedFromView(['/training-plan'])).toBeNull();
    expect(submittedFromView({ toString: () => '/training-plan' })).toBeNull();
  });

  it('refuses an absent value', () => {
    expect(submittedFromView(null)).toBeNull();
    expect(submittedFromView(undefined)).toBeNull();
  });
});
