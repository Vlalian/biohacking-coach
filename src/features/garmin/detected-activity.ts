import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { detectedActivities, sessions, sessionStreams, events } from '@/db/schema';
import { isValidScore } from '@/features/session/rate-session';
import { isEligibleMatch } from './match-activities';

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
  /**
   * The Planned Session this would complete, named rather than just pointed at.
   *
   * The card has to say *which* session it is about to complete: on a Double
   * day the athlete has two planned sessions and no way to tell which one a
   * generic "completes your planned session" means — and an in-place
   * completion is not undoable by any of the ordinary controls.
   *
   * Null when there is no longer an eligible match, so the card says "adds
   * this to your week" — which is what accepting would actually do.
   */
  matched: {
    id: string;
    type: string;
    duration: number | null;
    zone: string | null;
  } | null;
};

export type AcceptResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'invalid' };

export type DeclineResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-owner' };

/**
 * Everything this athlete has uploaded and not yet resolved, oldest day first.
 *
 * The matched session is joined and then re-checked with the same eligibility
 * the accept path uses. A match chosen at import can go stale — the athlete
 * moves, skips or completes that session — and a card still promising to
 * complete it would be describing something that will not happen.
 */
export async function listPendingActivities(athleteId: string): Promise<PendingActivity[]> {
  const rows = await getDb()
    .select({
      id: detectedActivities.id,
      date: detectedActivities.date,
      type: detectedActivities.type,
      sport: detectedActivities.sport,
      duration: detectedActivities.duration,
      note: detectedActivities.note,
      matchedId: sessions.id,
      matchedType: sessions.type,
      matchedDuration: sessions.duration,
      matchedZone: sessions.zone,
      matchedDate: sessions.date,
      matchedStatus: sessions.status,
      matchedParked: sessions.parked,
    })
    .from(detectedActivities)
    .leftJoin(sessions, eq(detectedActivities.matchedSessionId, sessions.id))
    .where(eq(detectedActivities.athleteId, athleteId))
    .orderBy(asc(detectedActivities.date), asc(detectedActivities.createdAt));

  return rows.map((row) => {
    const live =
      row.matchedId !== null &&
      isEligibleMatch(
        { date: row.matchedDate!, status: row.matchedStatus!, parked: row.matchedParked! },
        row.date,
      );

    return {
      id: row.id,
      date: row.date,
      type: row.type,
      sport: row.sport,
      duration: row.duration,
      note: row.note,
      matched: live
        ? {
            id: row.matchedId!,
            type: row.matchedType!,
            duration: row.matchedDuration,
            zone: row.matchedZone,
          }
        : null,
    };
  });
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
): Promise<{ id: string; duration: number | null } | null> {
  const [row] = await getDb()
    .select({
      athleteId: sessions.athleteId,
      date: sessions.date,
      status: sessions.status,
      parked: sessions.parked,
      duration: sessions.duration,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return null;
  if (row.athleteId !== athleteId) return null;
  if (!isEligibleMatch(row, date)) return null;
  return { id: sessionId, duration: row.duration };
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

  const sessionId = target?.id ?? randomUUID();
  const write = target
    ? db
        .update(sessions)
        .set({ status: 'completed', parked: false, ...provenance, ...reflection })
        // The status rides in the WHERE as well as the SET: the session was read
        // in a separate statement, so a skip or a completion landing in between
        // must lose the write rather than be silently overwritten.
        .where(
          and(
            eq(sessions.id, target.id),
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
      // `previousDuration` is what undo puts back. The device's actual duration
      // overwrites the planned one (retired garmin-sync/03), so without this
      // the planned figure is simply gone — and the event log is already the
      // record of what happened, so it is the honest place to keep it rather
      // than a column that exists only to be read once.
      payload: {
        sessionId,
        date: activity.date,
        matched: target !== null,
        previousDuration: target?.duration ?? null,
      },
    }),
    db.delete(detectedActivities).where(eq(detectedActivities.id, activityId)),
  ]);

  return { ok: true, sessionId };
}

export type UndoResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'not-imported' };

/**
 * The session ids this athlete completed by accepting a Detected Activity.
 *
 * Read from the event log rather than a column: `garmin_imported` already
 * records exactly this, and a column duplicating it is a second thing that can
 * disagree. One small query per Training Plan render, kept off the hot session
 * read.
 */
export async function listImportedSessionIds(athleteId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ payload: events.payload })
    .from(events)
    .where(and(eq(events.athleteId, athleteId), eq(events.type, 'garmin_imported')));

  return rows
    .map((r) => (r.payload as { sessionId?: string } | null)?.sessionId)
    .filter((id): id is string => typeof id === 'string');
}

/**
 * Takes back a completion the athlete made by accepting a Detected Activity.
 *
 * Without this, accepting was a one-way door and the fix for
 * showable-version/14 was only half a fix. An unmatched activity retro-logs as
 * an Athlete Session, which the drawer already lets the athlete delete — but a
 * *matched* one completes a Coach-planned session in place, and every ordinary
 * route out of that is closed: completing is one-directional, Skip and Session
 * Move both refuse a completed session, and delete refuses anything the
 * athlete did not author. So a wrong file accepted onto a planned session was
 * a permanent entry carrying the wrong duration, heart rate and distance —
 * exactly the harm the ticket was filed about, moved rather than removed.
 *
 * Deliberately not time-bounded. Bounding it would expire precisely where it
 * is needed: a catch-up upload of old files is both the likeliest place to
 * accept a wrong match and the place any deadline has already passed. This is
 * not editing history — it is disowning an assertion the athlete never meant
 * to make, the same reason their own sessions stay deletable at any age.
 *
 * Only a session the event log says came from an import can be undone, so this
 * cannot become a general un-complete button — that decision belongs to
 * `session-status.ts` and is still one-directional.
 */
export async function undoDetectedImport(params: {
  athleteId: string;
  sessionId: string;
}): Promise<UndoResult> {
  const { athleteId, sessionId } = params;
  const db = getDb();

  const [row] = await db
    .select({
      athleteId: sessions.athleteId,
      status: sessions.status,
      origin: sessions.origin,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return { ok: false, reason: 'not-found' };
  if (row.athleteId !== athleteId) return { ok: false, reason: 'not-owner' };
  // A retro-logged Athlete Session has no planned state to go back to —
  // reverting it would leave a session on a day the athlete never planned one.
  // Deleting it is the right undo there, and the Session Drawer already offers
  // that for anything they authored.
  if (row.status !== 'completed' || row.origin === 'athlete') {
    return { ok: false, reason: 'not-imported' };
  }

  // The event log is the authority on whether this completion came from an
  // import. Scoped to the athlete as well as the session id, so the lookup
  // cannot be steered by a forged id belonging to someone else.
  const [record] = await db
    .select({ payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.athleteId, athleteId),
        eq(events.type, 'garmin_imported'),
        sql`${events.payload}->>'sessionId' = ${sessionId}`,
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(1);

  if (!record) return { ok: false, reason: 'not-imported' };
  const previousDuration =
    (record.payload as { previousDuration?: number | null } | null)?.previousDuration ?? null;

  await db.batch([
    db
      .update(sessions)
      .set({
        status: 'planned',
        parked: false,
        // Back to a Planned Session: the device data goes, and so does the
        // Reflection, because the Reflection *was* the acceptance.
        duration: previousDuration,
        startTime: null,
        sport: null,
        summary: null,
        feedbackBody: null,
        feedbackMind: null,
        feedbackComment: null,
        ratedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(sessions.id, sessionId), eq(sessions.athleteId, athleteId))),
    db.delete(sessionStreams).where(eq(sessionStreams.sessionId, sessionId)),
    db.insert(events).values({
      athleteId,
      actorType: 'athlete',
      actorId: athleteId,
      type: 'garmin_import_undone',
      payload: { sessionId },
    }),
  ]);

  return { ok: true };
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
