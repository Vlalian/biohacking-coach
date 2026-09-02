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
function errorType(error: unknown): string {
  if (error instanceof EmptyCoachReplyError) return 'empty_coach_reply';
  if (error instanceof TypeError) return 'type_error';
  if (error instanceof SyntaxError) return 'syntax_error';
  if (error instanceof RangeError) return 'range_error';
  if (error instanceof Error) return 'error';
  return typeof error === 'object' && error === null ? 'null' : typeof error;
}

/**
 * Which surface the failed call came from.
 *
 * `feedback` is the Feedback Interview, which is not a Coach surface at all — it
 * is listed here because a failed interview turn is the one failure a tester is
 * most likely to be silent about afterwards: they reached the escape hatch to
 * complain and the escape hatch is what broke. It shares this log rather than
 * having its own so the surfaces can be compared in one query.
 */
export type CoachSurface = 'coach_chat' | 'weekly_session' | 'coach_briefing' | 'feedback';

export interface CoachFailure {
  surface: CoachSurface;
  /** Opaque athlete id — never a name or an email. */
  athleteId: string;
  conversationId: string | null;
  error: unknown;
  /** Overrides the reason derived from the error, where the caller knows better. */
  reason?: RefusalReason;
}

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
