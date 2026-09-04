import { isFrozen } from './move-rules';
import { canHeadCoachEditContent } from '@/features/coach/head-coach-authority';

/**
 * What a Session Drawer offers, decided outside the component that renders it.
 *
 * The drawer serves two audiences (CONTEXT.md, Session Drawer): the athlete on
 * their own calendar, and the Head Coach on a linked athlete's. They differ in
 * exactly two ways and both follow from the three-tier authority model
 * (ADR 0003) — which actions exist at all, and whether an absent action explains
 * itself.
 *
 * Pure, and deliberately not inside the drawer. The rules it applies are the
 * server's (`canHeadCoachEditContent`, `isFrozen`), and a component that
 * re-listed origins would be a second copy free to drift from the guard that
 * actually refuses the write. Here it asks them, and a test can hold the two
 * side by side.
 */

/**
 * Why the content actions — edit and delete — are not offered, or null when
 * they are.
 *
 * A reason rather than a boolean because the Head Coach's drawer states it.
 * The athlete's does not: it omits silently, which is the established behaviour
 * and is about audience, not inconsistency (CONTEXT.md, Session Drawer).
 */
export type ContentRefusal =
  /** The athlete's own entry. Their territory, view-only to the coach. */
  | 'athletes-own'
  /** An imported activity. Nobody edits reality. */
  | 'imported-record'
  /** Completed, or in a past week. The training record is immutable. */
  | 'frozen-record'
  /** Authored by someone else — the Coach's or the Head Coach's session. */
  | 'authors-content';

export interface DrawerPolicy {
/**
   * The actions only the person who trained may take: Mark complete, Skip,
   * Unavailable, and rating the session.
   *
   * One flag rather than several because they are one idea. Completing a
   * session claims training happened; a Session Reflection reports how it felt.
   * Both are claims about a body, and a Head Coach has neither — they outrank
   * the AI but not reality (ADR 0003).
   */
  ownReport: boolean;
  /** "Discuss with Coach" — meaningless when the viewer *is* the coach. */
  discuss: boolean;
  /** Edit and delete. */
  content: boolean;
  /** Why content is absent, or null when it is offered. */
  contentRefusal: ContentRefusal | null;
  /** Whether an absent action explains itself, rather than simply not being there. */
  explainsRefusals: boolean;
}

type PolicyInput = { origin: string; status: string; date: string };

/**
 * The athlete's own drawer — unchanged behaviour, expressed as a policy.
 *
 * `content` is `origin === 'athlete'`, exactly as the drawer computed inline
 * before this module existed. `explainsRefusals` is false: an athlete opening
 * the Coach's session does not benefit from being told why they cannot edit it,
 * every single time.
 */
export function athleteDrawerPolicy(session: PolicyInput): DrawerPolicy {
  return {
    ownReport: true,
    discuss: true,
    content: session.origin === 'athlete',
    // Always null, and that is not an oversight: the athlete's drawer does not
    // explain an absent action, so a reason here would be data nothing reads.
    // Carrying one anyway is how a value drifts out of step with reality
    // unnoticed — nothing renders it, so nothing catches it.
    contentRefusal: null,
    explainsRefusals: false,
  };
}

/**
 * Why the Head Coach may not edit this session's content, or null when they may.
 *
 * `canHeadCoachEditContent` is asked **first and alone** — it is the guard the
 * server applies, so it decides. The origin checks inside only *explain* an
 * answer already given; they never make one. Written the other way round, with
 * `garmin` and `athlete` checked before it, the call to the real guard became
 * unreachable for every origin the domain model has — a second copy of the rule
 * wearing the first one's clothes. Mutation testing found that on 2026-09-04,
 * which is the entire argument for the gate.
 */
function contentRefusalFor(session: PolicyInput, todayKey: string): ContentRefusal | null {
  if (!canHeadCoachEditContent(session.origin)) {
    if (session.origin === 'garmin') return 'imported-record';
    if (session.origin === 'athlete') return 'athletes-own';
    // Any origin the model gains later. "Not yours to edit" is the safe default
    // for a session whose author this function has never heard of.
    return 'authors-content';
  }
  // Editable by origin, but the record is immutable for everyone. Checked here
  // because the server does not check it: `loadEditable` refuses `not-found`,
  // `wrong-athlete` and `forbidden-origin` and nothing else, so a completed
  // coach-authored session is editable through that path. Until this drawer,
  // the only thing preventing it was `planSessions` filtering completed
  // sessions off the surface entirely. Filed separately; not relied on here.
  if (isFrozen({ date: session.date, status: session.status }, todayKey)) {
    return 'frozen-record';
  }
  return null;
}

/**
 * The Head Coach's drawer, on a linked athlete's session.
 *
 * **Status and reflection are absent, not merely unoffered.** Marking a session
 * complete is a claim that training happened in someone else's body, and a
 * Session Reflection is that person's report of how it felt — the Head Coach
 * outranks the AI but not reality (ADR 0003). Decided 2026-09-04.
 */
export function headCoachDrawerPolicy(session: PolicyInput, todayKey: string): DrawerPolicy {
  const contentRefusal = contentRefusalFor(session, todayKey);
  return {
    ownReport: false,
    discuss: false,
    content: contentRefusal === null,
    contentRefusal,
    explainsRefusals: true,
  };
}
