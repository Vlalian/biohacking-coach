import { shapedIdentifierIn } from '@/lib/identifiers';

/**
 * Preferred Name — what the athlete chooses for the Coach to call them
 * (`preferred-name/02`, ruled by Mads 2026-08-19/21).
 *
 * It is the one value that reaches a prompt *by the athlete's decision*, and
 * three things about it are settled and worth reading before touching it:
 *
 * - **It is a pseudonym by construction.** The athlete types it into a field
 *   that says what it is for, and decides the granularity. It is never
 *   derived from `user.name` — an earlier draft prefilled the first name and
 *   accepted it in one tap, and Mads reversed that: a default the athlete
 *   accepts is the app sending their real name, not the athlete choosing to.
 * - **It lives identity-side**, in `user.uiPrefs` beside the Athlete Language
 *   (`user-prefs-repository.ts`). No training table carries it (ADR 0006), and
 *   it reaches a prompt builder as a parameter, never read from a training row.
 * - **The prompt exempts it from `assertNoDirectIdentifier`** — it *is* a name,
 *   and the walk cannot tell a chosen name from a leaked one. So the shape
 *   check that every other free-text leaf gets at the prompt happens here, at
 *   the write boundary, the way Equipment refuses a phone number in a `details`
 *   field before it is stored rather than throwing when it is rendered.
 */

/** Long enough for any name someone wants to be called; short enough to be one. */
export const PREFERRED_NAME_MAX = 40;

export type ParsedPreferredName = { ok: true; name: string | null } | { ok: false };

/**
 * The write boundary: what a client may store as a Preferred Name.
 *
 * `undefined` and a blank string both mean "no name" — leaving the field empty
 * is an answer (the Coach stays nameless and second-person, exactly today's
 * behaviour), so it is `{ ok: true, name: null }` rather than a refusal. A
 * non-string is refused because a server action's payload is untrusted input,
 * not a typed call; so is anything over the cap or shaped like an email or
 * phone number, for the reason in the module comment.
 */
export function parsePreferredName(value: unknown): ParsedPreferredName {
  if (value === undefined) return { ok: true, name: null };
  if (typeof value !== 'string') return { ok: false };
  const name = value.trim().replace(/\s+/g, ' ');
  if (name === '') return { ok: true, name: null };
  if (name.length > PREFERRED_NAME_MAX) return { ok: false };
  if (shapedIdentifierIn(name) !== null) return { ok: false };
  return { ok: true, name };
}

/** The whitespace-separated tokens, case-folded; none for a blank value. */
function tokens(value: string): string[] {
  // Stryker disable next-line MethodExpression: equivalent. Both sides are
  // folded by this same call, so upper or lower case gives the same verdict.
  return value.toLowerCase().match(/\S+/g) ?? [];
}

/**
 * Whether a typed Preferred Name is (part of) the athlete's real name.
 *
 * Token-wise and case-insensitive, both ways: "mads", "Mads K" and the full
 * name all match "Mads Kilstrup", because each carries a whole token of it. A
 * nickname ("Madsen") or a prefix ("Ma") does not — that is a name the athlete
 * chose, not the one on the account.
 *
 * Advisory only. The screen shows a warning and asks the athlete to choose
 * again or confirm; it never blocks, because refusing would have the app
 * overrule someone on what they wish to be called. What it buys is that a real
 * name can never arrive by accident — only after someone read a sentence
 * saying so. Client-side is therefore sufficient, and this must not be
 * described as a control.
 */
export function matchesAccountName(name: string, accountName: string): boolean {
  const account = new Set(tokens(accountName));
  return tokens(name).some((t) => account.has(t));
}
