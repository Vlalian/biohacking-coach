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
 */

/** Which Coach surface the failed call came from. */
export type CoachSurface = 'coach_chat' | 'weekly_session' | 'coach_briefing';

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
        // The error's *class*, not its message: enough to tell an SDK failure
        // from a refusal, with none of the free text a message can carry.
        errorType: error instanceof Error ? error.name : typeof error,
      }),
    );
  } catch {
    // Deliberately silent: see above.
  }
}
