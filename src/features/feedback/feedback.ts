import type { Message } from '@/features/coach/conversation';
import { TRUST_SIGNAL_QUESTION } from './feedback-prompt';

/**
 * The Feedback Interview — the decision half. Pure: transcript in, a decision
 * out. No database, no Anthropic client.
 *
 * The interview itself is a conversation like any other (`showable-version/07`).
 * The one thing it does that a conversation does not decide for itself is *when
 * to ask the Trust Signal, and when it is being answered*, and that is what
 * lives here.
 */

/**
 * How many turns the tester takes before the Trust Signal is due.
 *
 * `CONTEXT.md` specifies the Trust Signal is asked "once, near the end", and
 * stops there — "near the end" is not derivable from anything else in the
 * document, so this is a decision rather than a reading. Chosen 2026-09-01 with
 * Mads: **three**. Long enough that the tester has said something specific for
 * the question to attach to; short enough that a tester who says two things and
 * leaves is still asked. A tester who leaves after one turn is not asked at all,
 * and that is correct — the answer would be the bare yes/no `CONTEXT.md` calls
 * the least valuable form of it.
 *
 * Deliberately one named constant rather than a rule spread through the prompt:
 * a model told "ask near the end" asks at random, which is not "once, near the
 * end". The service decides; the prompt is handed a block or nothing. Expect
 * Mads to reset this once real transcripts exist — that is what it is for.
 */
export const TRUST_SIGNAL_AFTER_TURNS = 3;

/** Whether the Trust Signal is due, given how much the tester has said. */
export function shouldAskTrustSignal(testerTurns: number, alreadyAsked: boolean): boolean {
  if (alreadyAsked) return false;
  return testerTurns >= TRUST_SIGNAL_AFTER_TURNS;
}

export interface TrustSignalState {
  /** Hand the prompt the "ask it now" block on this turn. */
  askNow: boolean;
  /** The tester's turn in flight is the answer — store it. */
  answering: boolean;
}

/**
 * What this turn should do about the Trust Signal.
 *
 * The transcript passed in is the stored one, so the tester's turn in flight is
 * counted separately: the decision is made while rendering the prompt *for* that
 * turn, and it has not been written yet.
 *
 * An answer is recognised structurally rather than by asking the model: if the
 * interviewer's last turn carried the question, whatever the tester says next is
 * the answer to it. That is why {@link TRUST_SIGNAL_QUESTION} goes into the
 * prompt verbatim — it is the marker as well as the wording.
 */
export function trustSignalState(
  storedTranscript: Message[],
  alreadyAnswered: boolean,
): TrustSignalState {
  const lastFromInterviewer = storedTranscript.findLast((m) => m.role === 'coach_ai');
  const answering =
    !alreadyAnswered && (lastFromInterviewer?.content.includes(TRUST_SIGNAL_QUESTION) ?? false);

  const testerTurns = storedTranscript.filter((m) => m.role === 'athlete').length + 1;

  return {
    askNow: shouldAskTrustSignal(testerTurns, alreadyAnswered || answering),
    answering,
  };
}
