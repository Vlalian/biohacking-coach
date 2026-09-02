import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions } from '@/db/schema';
import { classifyMove } from './move-rules';
import { casUpdateSession } from './versioned-write';
import type { SessionConflict } from './conflict';

/**
 * The result of an attempted move. On failure, `reason` says why, so the caller
 * can stay silent (the client already knows) without guessing.
 *
 * `'conflict'` is the exception that does carry a payload: the client cannot
 * know that someone else moved or edited the session underneath it, so the
 * refusal has to say what won (`versioned-write.ts`).
 */
export type MoveResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not-authenticated' | 'not-found' | 'not-owner' | 'frozen' | 'bounce';
    }
  | { ok: false; reason: 'conflict'; conflict: SessionConflict };

/**
 * Who is performing a move. Placement stopped being the athlete's alone on
 * 2026-08-21 (ADR 0003 amendment): a Head Coach may move sessions on a linked
 * athlete's plan, and the athlete may move them back. The actor is what the
 * recorded `session_moved` event carries, which is the material narration needs
 * to tell the athlete *who* moved their training.
 */
export type MoveActor =
  | { type: 'athlete'; athleteId: string }
  | { type: 'head_coach'; headCoachId: string };

/**
 * Applies a Session Move under server authority (ADR 0006), for either actor.
 *
 * Callers reach this through {@link moveSession} (the athlete) or
 * `moveSessionAsHeadCoach` (the coach). Both land here on purpose: the Move
 * rules are the product, and a second copy of them for the second actor is how
 * the two paths drift until one permits what the other refuses.
 *
 * The `athleteId` is always the athlete who owns the plan — resolved upstream
 * from the authenticated session for an athlete, and from a proven Coaching
 * Link for a coach; never from the request body either way. This function
 * proves the session belongs to that athlete, re-runs the Move rules against
 * the *server's* today, and only on a clean `move` writes anything.
 *
 * The session update and the `session_moved` event land in one transaction:
 * both or neither.
 *
 * The event is written with its actor and `narrated_at` null, and narration
 * collects it on the athlete's next app-open — but only when the actor was the
 * Head Coach. An athlete moving their own session is filtered out by
 * `actor_type` and stays silent, as CONTEXT.md requires: nobody needs telling
 * what they just did themselves.
 *
 * `from` and `to` are both in the payload because the narrated sentence names
 * both days. A move means the pair, not the destination.
 *
 * The move carries the version the client read. A Head Coach editing the same
 * session sets its `date` too, so placement is contested: without the version
 * the later of the two writes would silently win. Narration is benched (ticket
 * 02, amended) — the event is recorded with its actor and `narrated_at` stays
 * null; nothing is announced.
 */
export async function applyMove(params: {
  athleteId: string;
  sessionId: string;
  targetDate: string;
  today: string;
  expectedVersion: number;
  actor: MoveActor;
  /**
   * The gate on the session's `origin`, applied before the Move rules run. The
   * Head Coach's refuses an Athlete Session — that stays the athlete's
   * territory; the athlete's own admits everything, since placement remains
   * theirs in full.
   *
   * Required, with no default, on purpose. A gate that may be omitted defaults
   * to *open*, so the day a third caller appears the safe-looking omission is
   * the one that silently widens authority over someone else's training. Saying
   * `allOrigins` out loud costs one line and cannot be forgotten.
   */
  permittedOrigin: (origin: string) => boolean;
}): Promise<MoveResult> {
  const { athleteId, sessionId, targetDate, today, expectedVersion, actor, permittedOrigin } =
    params;

  const [row] = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return { ok: false, reason: 'not-found' };
  if (row.athleteId !== athleteId) return { ok: false, reason: 'not-owner' };
  // Refused as 'not-owner' rather than a new reason: from the caller's side it
  // is the same answer — this session is not yours to place.
  if (!permittedOrigin(row.origin)) {
    return { ok: false, reason: 'not-owner' };
  }

  const verdict = classifyMove({ date: row.date, status: row.status }, targetDate, today);
  if (verdict !== 'move') return { ok: false, reason: verdict };

  // The compare-and-set replaces the unconditional update this used to do, and
  // the event rides inside it rather than beside it: casUpdateSession writes the
  // event only if the update actually landed, so a refused move cannot leave a
  // `session_moved` event claiming a move that never happened.
  //
  // The actor is main's, not a hardcoded 'athlete'. Narration filters on
  // actor_type, so writing the wrong one here would either announce an athlete's
  // own move back at them or silence the Head Coach's.
  const written = await casUpdateSession({
    athleteId,
    sessionId,
    expectedVersion,
    set: { date: targetDate },
    attempted: { date: targetDate },
    event: {
      actorType: actor.type,
      actorId: actor.type === 'athlete' ? actor.athleteId : actor.headCoachId,
      type: 'session_moved',
      payload: { sessionId, from: row.date, to: targetDate },
    },
  });

  return written.ok ? { ok: true } : written;
}

/**
 * Every origin, admitted. The athlete's placement gate, named rather than
 * implied so that {@link applyMove} can require one of every caller.
 */
const allOrigins = () => true;

/**
 * The athlete moving their own session — the original and still the common
 * path. Placement remains theirs in full: no origin is off limits, including a
 * Prescribed Session the Head Coach authored (ADR 0002/0003).
 */
export async function moveSession(params: {
  athleteId: string;
  sessionId: string;
  targetDate: string;
  today: string;
  /** The version the client read. See {@link applyMove}. */
  expectedVersion: number;
}): Promise<MoveResult> {
  return applyMove({
    ...params,
    actor: { type: 'athlete', athleteId: params.athleteId },
    permittedOrigin: allOrigins,
  });
}
