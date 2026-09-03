import type { Message } from '@/features/coach/conversation';

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

/**
 * The refusals the app itself produces on the interview page, in the terms a
 * `fallback` row records them.
 *
 * One list, here in the core, because both ends of the escape hatch need it and
 * they used to carry a copy each: the client tags its submission with whichever
 * notice the tester just saw, and the server narrows what arrives to this set
 * rather than echoing it — it is a client-supplied string landing in a column
 * someone will later group by.
 *
 * `unsafe-content` is deliberately absent: it cannot arise on this surface (see
 * `feedback-service.ts`), so a row could never honestly carry it.
 */
export const FALLBACK_FAILURE_REASONS = ['coach-unavailable', 'consent-required'] as const;

export type FallbackFailureReason = (typeof FALLBACK_FAILURE_REASONS)[number];

/** The reason if it is one this app produces, or null for anything else. */
export function knownFailureReason(reason: string | null): FallbackFailureReason | null {
  return FALLBACK_FAILURE_REASONS.find((known) => known === reason) ?? null;
}

/** A path shape, and nothing longer or stranger than one. */
const VIEW_PATH_SHAPED = /^\/[A-Za-z0-9/_-]{0,63}$/;

/**
 * The View a fallback submission came from, or null.
 *
 * The interview is its own page, so the View the tester was *on* when they
 * reached the escape hatch is not something this page can observe — it is
 * carried in the link the escape hatch itself renders, which makes it a
 * client-supplied value landing in a stored column. A shape guard rather than an
 * allowlist of the app's paths: the column is read by a human for context, so an
 * unrecognised path is still worth having, while free text is not.
 *
 * `unknown` rather than `string | null`, because that is what a value arriving
 * from a browser actually is — the declared type of a server action's argument
 * is a promise the client never made. The `typeof` check is load-bearing for the
 * same reason: `test()` stringifies whatever it is handed, so an array holding
 * one path-shaped string passes the pattern and would be returned as an array
 * into a text column.
 */
export function submittedFromView(value: unknown): string | null {
  if (typeof value !== 'string' || !VIEW_PATH_SHAPED.test(value)) return null;
  return value;
}

/** How many turns the tester has taken, counting the one in flight. */
function testerTurnsIncludingInFlight(storedTranscript: Message[]): number {
  return storedTranscript.filter((m) => m.role === 'athlete').length + 1;
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
 * Both halves are decided by **position in the transcript**, which is the only
 * marker this module controls. The ask goes out on the turn where the tester
 * reaches {@link TRUST_SIGNAL_AFTER_TURNS} — exactly that turn, never a later
 * one — so the next turn they take is the answer to it.
 *
 * It used to read the answer by looking for `TRUST_SIGNAL_QUESTION` inside
 * the interviewer's last turn, and re-ask whenever it did not find it. That
 * coupled a stored answer to the model reproducing a sentence verbatim while the
 * prompt asked it to "work this question in, close to naturally" — so a
 * paraphrase, which is the likely case, meant the answer was never recognised
 * and the question was re-injected on every remaining turn. "Once, near the end"
 * became "every turn from the third onward". Position cannot paraphrase.
 *
 * The cost is the opposite failure: if the model ignores the ASK THIS NOW block
 * entirely, the tester's next turn is still recorded as the Trust Signal answer,
 * and it will not be one. That is visible to whoever reads the answer — it is
 * free text a human reads — whereas the failure it replaces was silent.
 */
export function trustSignalState(
  storedTranscript: Message[],
  alreadyAnswered: boolean,
): TrustSignalState {
  if (alreadyAnswered) return { askNow: false, answering: false };

  const storedTesterTurns = storedTranscript.filter((m) => m.role === 'athlete').length;

  return {
    askNow: testerTurnsIncludingInFlight(storedTranscript) === TRUST_SIGNAL_AFTER_TURNS,
    // The turn immediately after the one that carried the ask, and only that
    // turn: an answer that failed to store is not retried on the next turn,
    // because the question was asked once and is not being asked again.
    answering: storedTesterTurns === TRUST_SIGNAL_AFTER_TURNS,
  };
}
