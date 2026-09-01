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
 * Placement used to be outside this module entirely — "the athlete's tier
 * regardless of who authored the content". That changed on 2026-08-21 (ADR 0003
 * amendment): the Head Coach may move sessions on a linked athlete's plan, so
 * placement is now *shared* rather than transferred. The athlete keeps every
 * placement right they had, including moving a session the coach just moved;
 * what the coach gains is a say in when the training they authored happens.
 *
 * So this module owns two guards now: {@link canHeadCoachEditContent} for what
 * the coach may rewrite, {@link canHeadCoachMove} for what they may re-place.
 * They admit the same origins today, and they are kept apart so that one can
 * change without silently changing the other — an Athlete Session becoming
 * coach-movable, say, without becoming coach-editable.
 *
 * Which means each reads its *own* list. Two functions over one shared constant
 * would have been the appearance of that separation without the substance: the
 * only way to move one is to edit the constant, which moves both.
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
 * The origins the Head Coach may *re-place* (ADR 0003, 2026-08-21 amendment).
 *
 * Spelled out rather than aliased to {@link HEAD_COACH_EDITABLE_ORIGINS}. The
 * two lists agree today by coincidence of the current rules, not by definition:
 * "may rewrite this session" and "may decide which day it lands on" are
 * different permissions, and the first question likely to be asked of this
 * module — may a coach move an Athlete Session they may not edit? — is answered
 * by editing this line and nothing else.
 */
export const HEAD_COACH_MOVABLE_ORIGINS = ['coach', HEAD_COACH_ORIGIN] as const;

/**
 * True when a session of this origin is within the Head Coach's content
 * authority. False for Athlete Sessions (their territory) and Garmin imports
 * (the immutable record) — the guard that keeps "may only view Athlete
 * Sessions" true on the server, not just in the UI.
 */
export function canHeadCoachEditContent(origin: string): boolean {
  return (HEAD_COACH_EDITABLE_ORIGINS as readonly string[]).includes(origin);
}

/**
 * True when a session of this origin is within the Head Coach's *placement*
 * authority (ADR 0003, 2026-08-21 amendment).
 *
 * False for Athlete Sessions: that rule was not reversed, and the athlete's own
 * entries stay their territory — a coach sees them and leaves them where they
 * are. False for Garmin imports too, though the Move rules would refuse those
 * anyway as completed sessions; stating it here means the answer does not
 * depend on that coincidence.
 *
 * The rest — whether the day is in the past, the week, or frozen — is not this
 * module's business. Those are the Move rules, and they apply identically to
 * both actors.
 */
export function canHeadCoachMove(origin: string): boolean {
  return (HEAD_COACH_MOVABLE_ORIGINS as readonly string[]).includes(origin);
}
