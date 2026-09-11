/**
 * The two decisions `saveCheckInAction` makes about what it was handed, kept
 * out of the `'use server'` file so they can be tested as the plain functions
 * they are. A server action's payload is typed by assertion only — what arrives
 * is whatever the client sent — and these are where that is judged.
 */

/** The longest notable signal stored. It reaches the model verbatim. */
export const NOTABLE_SIGNAL_MAX = 500;

/**
 * The athlete's free-text signal, normalised, or `undefined` when it is not
 * text at all.
 *
 * Three outcomes, deliberately distinct: a string becomes a trimmed, capped
 * string or `null` when it was only whitespace; `null` stays `null` ("wrote
 * nothing"); anything else is `undefined`, which the action refuses as
 * `invalid` rather than throwing on — a number here used to reach `.trim()`
 * and go to the error boundary (CodeRabbit, PR #60).
 */
export function normaliseNotableSignal(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, NOTABLE_SIGNAL_MAX) : null;
}

/**
 * Whether a save failure is the athlete's to fix.
 *
 * The repository refuses a partial or out-of-range Check-in with a message
 * saying it is not complete; that is theirs, and they get told so. Anything
 * else — the database being down, a constraint nobody predicted — is not, and
 * reporting it as "your Check-in was malformed" sends them to re-answer a form
 * that was fine.
 */
export function isAthleteFault(error: unknown): boolean {
  return error instanceof Error && /not complete/i.test(error.message);
}
