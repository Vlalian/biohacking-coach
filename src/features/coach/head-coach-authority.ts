/**
 * The Head Coach's authority over a plan, as pure rules on a session's `origin`.
 *
 * The three-tier model (ADR 0003, and the Prescribed Session glossary entry):
 * **placement belongs to the athlete, content belongs to the author, the Head
 * Coach outranks the AI but not reality.** This module owns the content tier —
 * what the Head Coach may edit or delete — expressed the same way every other
 * authority rule is: a guard on `origin`, in the pattern of the Garmin guards.
 *
 * A Prescribed Session is `origin: 'head_coach'`. The Head Coach is
 * editor-in-chief of the *plan*: they may edit or delete the Coach's drafts and
 * their own prescriptions. Two origins are outside their content authority:
 *
 *   - **`athlete`** — an Athlete Session is the athlete's own territory,
 *     view-only even to the Head Coach.
 *   - **`garmin`** — an imported activity is the immutable record of what
 *     happened; no one edits reality.
 *
 * Placement (the Session Move) is deliberately NOT decided here: the athlete may
 * move a Prescribed Session like any other, because placement is the athlete's
 * tier regardless of who authored the content (ADR 0002/0003, the Move rules).
 * This module is only about content.
 */

/** The origin a Head Coach's newly prescribed session carries. */
export const HEAD_COACH_ORIGIN = 'head_coach';

/**
 * The origins whose *content* the Head Coach may edit or delete: the Coach's
 * drafts and the Head Coach's own prescriptions — the plan they are
 * editor-in-chief of.
 */
export const HEAD_COACH_EDITABLE_ORIGINS = ['coach', HEAD_COACH_ORIGIN] as const;

/**
 * True when a session of this origin is within the Head Coach's content
 * authority. False for Athlete Sessions (their territory) and Garmin imports
 * (the immutable record) — the guard that keeps "may only view Athlete
 * Sessions" true on the server, not just in the UI.
 */
export function canHeadCoachEditContent(origin: string): boolean {
  return (HEAD_COACH_EDITABLE_ORIGINS as readonly string[]).includes(origin);
}
