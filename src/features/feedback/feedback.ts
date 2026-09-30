/**
 * The feedback page's one decision, pure: which View a submission came from.
 *
 * Feedback is a plain comment field (`showable-version/58`; ADR 0009, amended
 * 2026-09-30). What the tester writes is stored as they wrote it; the only value
 * that needs narrowing is the one the browser supplies alongside it.
 */

/** A path shape, and nothing longer or stranger than one. */
const VIEW_PATH_SHAPED = /^\/[A-Za-z0-9/_-]{0,63}$/;

/**
 * The longest comment the feedback page stores, in characters (CodeRabbit, PR #120).
 * About 800 words: far past "a couple of sentences", so no real note is cut, while
 * a direct call to the server action cannot grow a row without bound. The
 * textarea carries the same limit, so the page never offers more than is kept.
 */
export const FEEDBACK_MAX_LENGTH = 5000;

/**
 * The View a feedback submission came from, or null.
 *
 * The feedback page is its own page, so the View the tester was *on* when they
 * reached the escape hatch is not something it can observe — it is
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
