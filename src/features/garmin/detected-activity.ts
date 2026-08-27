import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { detectedActivities, sessions, sessionStreams, events } from '@/db/schema';
import { isValidScore } from '@/features/session/rate-session';

/**
 * What the athlete does with a Detected Activity once it has been proposed.
 *
 * The rule from `CONTEXT.md` this module completes: detection proposes, and
 * **the athlete's Session Reflection rating is the gesture that confirms and
 * commits the session to the record**. So there is no bare "accept" here —
 * accepting *is* rating. Until that happens nothing in `sessions` has changed,
 * which is what makes declining free: it deletes a row from a table the
 * training record does not read.
 */

/** A proposal waiting for the athlete, as the UI needs it. */
export type PendingActivity = {
  id: string;
  date: string;
  type: string;
  sport: string | null;
  duration: number | null;
  note: string | null;
  /** The Planned Session this proposes to complete, decided at import. */
  matchedSessionId: string | null;
};

export type AcceptResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'invalid' };

export type DeclineResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-owner' };

/** Everything this athlete has uploaded and not yet resolved, oldest day first. */
export async function listPendingActivities(athleteId: string): Promise<PendingActivity[]> {
  return getDb()
    .select({
      id: detectedActivities.id,
      date: detectedActivities.date,
      type: detectedActivities.type,
      sport: detectedActivities.sport,
      duration: detectedActivities.duration,
      note: detectedActivities.note,
      matchedSessionId: detectedActivities.matchedSessionId,
    })
    .from(detectedActivities)
    .where(eq(detectedActivities.athleteId, athleteId))
    .orderBy(asc(detectedActivities.date), asc(detectedActivities.createdAt));
}

async function loadOwned(activityId: string, athleteId: string) {
  const [row] = await getDb()
    .select()
    .from(detectedActivities)
    .where(eq(detectedActivities.id, activityId))
    .limit(1);

  if (!row) return { ok: false as const, reason: 'not-found' as const };
  // Deliberately not filtered on athlete_id in the query: "no such proposal"
  // and "not yours" are different answers and a filtered read collapses them.
  if (row.athleteId !== athleteId) return { ok: false as const, reason: 'not-owner' as const };
  return { ok: true as const, row };
}

/**
 * The matched session's id if it can still take the completion, else null.
 *
 * The same eligibility `matchActivities` applies at import — owned, same day,
 * still `planned`, not parked — because the athlete has had the whole interval
 * since the upload to change any of them.
 */
async function stillMatchable(
  sessionId: string,
  athleteId: string,
  date: string,
): Promise<string | null> {
  const [row] = await getDb()
    .select({
      athleteId: sessions.athleteId,
      date: sessions.date,
      status: sessions.status,
      parked: sessions.parked,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return null;
  if (row.athleteId !== athleteId) return null;
  if (row.date !== date) return null;
  if (row.status !== 'planned' || row.parked) return null;
  return sessionId;
}

/**
 * Commits a proposed Detected Activity, with the Reflection that confirms it.
 *
 * Two shapes, decided by whether the proposal's match is *still* good. The
 * match was chosen at import; between then and now the athlete may have moved,
 * skipped, completed or deleted that Planned Session. So it is re-read and
 * re-checked here rather than trusted — a stale match degrades to the
 * retro-log rather than writing a completion onto the wrong session.
 *
 * - **Match still good** — that session is completed *in place*, keeping its
 *   id, its Coach note and its zone. One entry on the day, which is the whole
 *   point of matching: the import used to insert a second one beside it.
 * - **No match** — a new Athlete Session, already completed. `origin:
 *   'athlete'` is deliberate and load-bearing: `CONTEXT.md` calls an unmatched
 *   activity a "retro-logged Athlete Session", and origin is what every
 *   edit/delete guard keys off, so a wrong file the athlete accepted is theirs
 *   to delete afterwards.
 *
 * All of it — the session write, the streams, the event, and the removal of
 * the proposal — goes in one `db.batch`, so a half-accepted activity cannot
 * survive a failure.
 */
export async function acceptDetectedActivity(params: {
  athleteId: string;
  activityId: string;
  body: number;
  mind: number;
  comment: string | null;
}): Promise<AcceptResult> {
  const { athleteId, activityId, body, mind, comment } = params;

  if (!isValidScore(body) || !isValidScore(mind)) return { ok: false, reason: 'invalid' };

  const found = await loadOwned(activityId, athleteId);
  if (!found.ok) return found;
  const activity = found.row;

  const db = getDb();
  // comment is typed string|null, but a forged request could send anything;
  // guard the runtime type before trimming so it can never throw.
  const trimmed = typeof comment === 'string' ? comment.trim() : '';
  const reflection = {
    feedbackBody: body,
    feedbackMind: mind,
    feedbackComment: trimmed ? trimmed : null,
    ratedAt: new Date(),
    updatedAt: new Date(),
  };
  // What the device recorded. The planned duration is overwritten by the actual
  // one; the Coach note and zone are not touched (retired garmin-sync/03).
  const provenance = {
    startTime: activity.startTime,
    sport: activity.sport,
    summary: activity.summary,
    duration: activity.duration,
  };

  const target = activity.matchedSessionId
    ? await stillMatchable(activity.matchedSessionId, athleteId, activity.date)
    : null;

  const sessionId = target ?? randomUUID();
  const write = target
    ? db
        .update(sessions)
        .set({ status: 'completed', parked: false, ...provenance, ...reflection })
        // The status rides in the WHERE as well as the SET: the session was read
        // in a separate statement, so a skip or a completion landing in between
        // must lose the write rather than be silently overwritten.
        .where(
          and(
            eq(sessions.id, target),
            eq(sessions.athleteId, athleteId),
            eq(sessions.status, 'planned'),
          ),
        )
    : db.insert(sessions).values({
        id: sessionId,
        athleteId,
        date: activity.date,
        type: activity.type,
        // A retro-logged Athlete Session — the athlete's own, so deletable.
        origin: 'athlete',
        status: 'completed',
        isTraining: true,
        note: activity.note,
        dayOrder: 0,
        ...provenance,
        ...reflection,
      });

  await db.batch([
    write,
    db
      .insert(sessionStreams)
      .values({ sessionId, samples: activity.samples })
      // A matched Planned Session has no streams, but a re-accept after a
      // partial failure must not fail on the primary key.
      .onConflictDoUpdate({
        target: sessionStreams.sessionId,
        set: { samples: activity.samples },
      }),
    db.insert(events).values({
      athleteId,
      actorType: 'athlete',
      actorId: athleteId,
      type: 'garmin_imported',
      payload: { sessionId, date: activity.date, matched: target !== null },
    }),
    db.delete(detectedActivities).where(eq(detectedActivities.id, activityId)),
  ]);

  return { ok: true, sessionId };
}

/**
 * Discards a proposal. The calendar is left exactly as it was, because the
 * proposal never reached it — there is no session to delete and no status to
 * put back.
 */
export async function declineDetectedActivity(params: {
  athleteId: string;
  activityId: string;
}): Promise<DeclineResult> {
  const found = await loadOwned(params.activityId, params.athleteId);
  if (!found.ok) return found;

  await getDb().delete(detectedActivities).where(eq(detectedActivities.id, params.activityId));
  return { ok: true };
}
