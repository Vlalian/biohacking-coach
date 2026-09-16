import type { BlockSetProblem } from '@/features/coach/training-blocks';
import { refusalReason, type RefusalReason } from './identifiers';
import { EmptyCoachReplyError } from '@/features/coach/coach-client';

/**
 * Failure visibility for the Coach path (`showable-version/05`, item 2).
 *
 * Before this there was **no logging at all** on the Coach path — verified, not
 * assumed: no `console.*` anywhere in `src/features/coach/`, `chat-actions.ts`
 * or `weekly-actions.ts`. A failed Coach call left the athlete a string and the
 * server nothing.
 *
 * That matters more for an unattended test than it looks. A tester whose Coach
 * call failed and a tester who simply did not like the product both go quiet,
 * and silence is the one signal you cannot interpret afterwards. This makes the
 * first kind legible.
 *
 * Vercel's runtime logs are the destination, so a JSON line on `console.error`
 * is the whole mechanism — no new infrastructure, and structured so it can be
 * filtered by `event` or grouped by `surface`.
 *
 * **What it deliberately does not carry:** the athlete's words, the prompt, the
 * reply, or anything identifying. The athlete is the opaque id and nothing else
 * (ADR 0006), and the error's own message is dropped rather than logged —
 * `assertNoDirectIdentifier` throws with detail about what it matched, so
 * forwarding messages verbatim is exactly how an email would end up in a log
 * line. What survives is the taxonomy, which is what a debugger actually needs;
 * the transcript is in the database if someone needs to read it.
 *
 * That reasoning applies to `error.name` too, which is why {@link errorType}
 * exists rather than reading the property. `Error.name` is writable — nothing
 * stops `err.name = someone@example.com` — so forwarding it would reopen the
 * channel dropping the message was meant to close (CodeRabbit, PR #39). The
 * classification is drawn from a closed list of constructors this code knows,
 * and everything else collapses to a literal.
 */

/**
 * The error's class as a **fixed literal**, never a value read off the error.
 *
 * A closed set, matched by `instanceof` against constructors this module
 * imports. Anything unrecognised is `other` — deliberately uninformative rather
 * than deliberately detailed, because the alternative is echoing an attacker-
 * or athlete-controlled string into a log line.
 */
// Most specific first: every entry below `EmptyCoachReplyError` is also an
// `Error`, so the generic row has to be last. Built per call rather than at
// module load so a test that mocks the Coach client without the error class
// does not fail this module's import.
function errorClasses(): [new (...args: never[]) => unknown, string][] {
  return [
    [EmptyCoachReplyError, 'empty_coach_reply'],
    [TypeError, 'type_error'],
    [SyntaxError, 'syntax_error'],
    [RangeError, 'range_error'],
    [Error, 'error'],
  ];
}

function errorType(error: unknown): string {
  const known = errorClasses().find(([klass]) => error instanceof klass);
  if (known) return known[1];
  return error === null ? 'null' : typeof error;
}

/**
 * Which surface the failed model call came from.
 *
 * Named for the model call rather than for the Coach, because one of these is
 * not a Coach surface: `feedback` is the Feedback Interview, conducted by an
 * interviewer that is explicitly not the Coach (ADR 0009). It is listed here
 * because a failed interview turn is the one failure a tester is most likely to
 * be silent about afterwards — they reached the escape hatch to complain and the
 * escape hatch is what broke — and it shares this log rather than having its own
 * so the surfaces can be compared in one query.
 */
export type ModelSurface =
  | 'coach_chat'
  | 'weekly_session'
  | 'coach_briefing'
  | 'feedback'
  /** The background Training Block adjustment (`training-architecture/07`); no conversation. */
  | 'block_adjustment'
  /** The silent week draft (`training-architecture/16`); no conversation. */
  | 'week_draft';

export interface CoachFailure {
  surface: ModelSurface;
  /** Opaque athlete id — never a name or an email. */
  athleteId: string;
  conversationId: string | null;
  error: unknown;
  /** Overrides the reason derived from the error, where the caller knows better. */
  reason?: FailureReason;
}

/**
 * Why a logged call did not do what it set out to.
 *
 * Wider than {@link RefusalReason} by exactly one value. A refusal is something
 * the athlete is told about and can act on; `after-store` is not — it is work
 * that failed *after* a turn was safely written, swallowed on purpose so it
 * cannot undo the turn (`conversation-turn.ts`). Nobody sees it but this log,
 * which is the only reason it is recoverable at all.
 */
export type FailureReason = RefusalReason | 'after-store';

/**
 * Writes one structured line for a Coach call that did not produce a reply.
 *
 * Never throws. A logger that can fail the request it is describing turns an
 * observability gap into an outage, which is a strictly worse trade.
 */
export function logCoachFailure(failure: CoachFailure): void {
  try {
    const { surface, athleteId, conversationId, error } = failure;
    console.error(
      JSON.stringify({
        event: 'coach_call_failed',
        surface,
        athleteId,
        conversationId,
        reason: failure.reason ?? refusalReason(error),
        // Only present on an empty reply, and it is the field that says which
        // kind of empty — the bug this has already produced once in the wild
        // (`fix/coach-empty-reply`).
        ...(error instanceof EmptyCoachReplyError && error.stopReason
          ? { stopReason: error.stopReason }
          : {}),
        // A fixed classification, not `error.name`: see errorType.
        errorType: errorType(error),
      }),
    );
  } catch {
    // Deliberately silent: see above.
  }
}

/**
 * Writes one structured line for narration that could not be delivered.
 *
 * Narration makes no Anthropic call, so it is not a {@link CoachFailure} and
 * does not share its `surface` taxonomy — but it runs on a render path, where a
 * throw would take down the app shell. The caller swallows the error to keep
 * the shell up; this is what stops that swallow from being silent. Nothing was
 * stamped, so the events stay pending and narrate on the next app-open.
 *
 * Same discipline as above: the opaque athlete id, and the error's class rather
 * than its message.
 */
export function logNarrationFailure(athleteId: string, error: unknown): void {
  try {
    console.error(
      JSON.stringify({
        event: 'narration_failed',
        athleteId,
        errorType: errorType(error),
      }),
    );
  } catch {
    // Deliberately silent: see above.
  }
}

/**
 * Writes one structured line for a Training Block adjustment the app refused to
 * store (`training-architecture/07`).
 *
 * The Coach answered — no failure to log in the sense above — but what it
 * handed back was not a set the athlete can be shown: the wrong shape
 * (`malformed`), or one `validateBlockSet` turned down, named by its reason. The
 * athlete stays on the arithmetic draft either way, and this is the only place
 * that says so. The reason is a closed literal from the validator, never a
 * string read off the reply.
 */
export function logBlockAdjustmentRefused(
  athleteId: string,
  reason: BlockSetProblem | 'malformed',
): void {
  try {
    console.error(JSON.stringify({ event: 'block_adjustment_refused', athleteId, reason }));
  } catch {
    // Deliberately silent: see above.
  }
}

/**
 * Writes one structured line when the background Training Block adjustment
 * threw past the service (`training-architecture/07`). The service catches the
 * Coach call itself; this is the last net under `after()`, where a throw would
 * otherwise be lost with the request. Same discipline: opaque id, error class.
 */
export function logBlockAdjustmentFailure(athleteId: string, error: unknown): void {
  try {
    console.error(
      JSON.stringify({ event: 'block_adjustment_failed', athleteId, errorType: errorType(error) }),
    );
  } catch {
    // Deliberately silent: see above.
  }
}

/**
 * The week draft's `after()` boundary (`training-architecture/16`): the
 * service never throws, so this line means something outside it did — the
 * repository, the driver — and the athlete simply keeps the offer to plan by
 * talking. Same reasoning as {@link logNarrationFailure}: a missed draft
 * retries on the next app-open; a thrown shell does not.
 */
export function logWeekDraftFailure(athleteId: string, error: unknown): void {
  try {
    // The class, never the message — the same discipline as every other line
    // here (see the header). A driver error here echoes the INSERT it failed
    // on, and that INSERT carries the draft's session notes.
    console.error(JSON.stringify({ event: 'week_draft_failed', athleteId, errorType: errorType(error) }));
  } catch {
    // Deliberately silent: see above.
  }
}

/**
 * Writes one structured line when a Coach reply names a source in its own words
 * (`knowledge-oracle/05`, decision 3: the reply stays silent about sources; the
 * app lists them). **A check that logs, never a rewrite** — the reply is stored
 * as the model wrote it, and this is how Mads sees whether the instruction is
 * holding without reading transcripts. The pattern names, never the text.
 */
export interface CoachDrift {
  surface: ModelSurface;
  athleteId: string;
  conversationId: string | null;
  /** From `sourceMentions` — e.g. `bracket-marker`, `according-to-study`. */
  patterns: string[];
}

/**
 * Writes one structured line when a lookup could not run — the embedder or the
 * corpus database failing, not an empty corpus and not an identifier refusal.
 * The Coach turn completes regardless (the athlete reads "lookup unavailable"),
 * which is exactly why this line exists: without it a retrieval outage and a
 * turn with no lookup look the same in the logs (CodeRabbit, PR #67). It is
 * not a {@link CoachFailure}: a reply was produced. Same discipline — the
 * opaque id and the error's class, never its message.
 */
export interface LookupFailure {
  surface: ModelSurface;
  athleteId: string;
  conversationId: string | null;
  error: unknown;
}

export function logLookupFailure(failure: LookupFailure): void {
  try {
    console.error(
      JSON.stringify({
        event: 'lookup_failed',
        surface: failure.surface,
        athleteId: failure.athleteId,
        conversationId: failure.conversationId,
        errorType: errorType(failure.error),
      }),
    );
  } catch {
    // Deliberately silent: see logCoachFailure.
  }
}

export function logCoachDrift(drift: CoachDrift): void {
  try {
    console.warn(
      JSON.stringify({
        event: 'coach_source_mention',
        surface: drift.surface,
        athleteId: drift.athleteId,
        conversationId: drift.conversationId,
        patterns: drift.patterns,
      }),
    );
  } catch {
    // Deliberately silent: see logCoachFailure.
  }
}
