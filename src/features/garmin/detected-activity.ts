import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { detectedActivities, sessions, sessionStreams, events } from '@/db/schema';
import { isValidScore } from '@/features/session/rate-session';
import { isChoosableTarget, isEligibleMatch } from './match-activities';
import { getSessionsOnDates } from '@/features/session/session-repository';

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

/** A session on the activity's day that the athlete may point it at. */
export type TargetOption = {
  id: string;
  type: string;
  status: string;
  duration: number | null;
  zone: string | null;
};

/** A proposal waiting for the athlete, as the UI needs it. */
export type PendingActivity = {
  id: string;
  date: string;
  type: string;
  sport: string | null;
  duration: number | null;
  note: string | null;
  /**
   * Every session on that day the athlete may say this activity was, in the
   * day's own order.
   *
   * The card offers a choice rather than a verdict because the matcher cannot
   * always tell: `SPORT_MAP` sends running, cycling, swimming and rowing all
   * to `Endurance`, so on a morning-swim/evening-ride day — what `CONTEXT.md`
   * calls standard Ironman practice — both Planned Sessions look identical to
   * it and it picks the earlier one by `dayOrder`. Upload the ride and it
   * would complete the swim.
   *
   * Wider than what the matcher may claim on its own: a skipped or displaced
   * session is offered here, because the athlete is allowed to say they did it
   * after all (see `isChoosableTarget`).
   */
  options: TargetOption[];
  /**
   * The matcher's suggestion, pre-selected on the card. Null when it has no
   * eligible match and the activity would be added as a new session.
   */
  suggestedSessionId: string | null;
};

export type AcceptResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'invalid' | 'bad-target' };

export type DeclineResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-owner' };

/**
 * Everything this athlete has uploaded and not yet resolved, oldest day first,
 * each with the day's sessions it could be.
 *
 * The stored match is re-checked with the same eligibility the accept path
 * uses before it is offered as the suggestion: a match chosen at import can go
 * stale — the athlete moves, skips or completes that session — and a card
 * still pre-selecting it would be pointing at something that will not happen.
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
      matchedSessionId: detectedActivities.matchedSessionId,
    })
    .from(detectedActivities)
    .where(eq(detectedActivities.athleteId, athleteId))
    .orderBy(asc(detectedActivities.date), asc(detectedActivities.createdAt));

  if (rows.length === 0) return [];

  const onDates = await getSessionsOnDates(athleteId, [...new Set(rows.map((r) => r.date))]);

  return rows.map((row) => {
    const onDay = onDates.filter((session) => isChoosableTarget(session, row.date));
    const options = onDay.map(({ id, type, status, duration, zone }) => ({
      id,
      type,
      status,
      duration,
      zone,
    }));

    // Choosable and *suggested* are different bars. If the athlete has skipped
    // or parked the matched session since uploading, they may still say they
    // did it — but the machine no longer gets to propose it, so it stops being
    // the pre-selected answer.
    const suggested = onDay.find(
      (session) => session.id === row.matchedSessionId && isEligibleMatch(session, row.date),
    );

    return {
      id: row.id,
      date: row.date,
      type: row.type,
      sport: row.sport,
      duration: row.duration,
      note: row.note,
      options,
      suggestedSessionId: suggested?.id ?? null,
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
 * The session the athlete chose, if they are allowed to choose it, else null.
 *
 * The id arrives from the browser, so none of it is trusted: ownership, the
 * day, and the status are all re-read here. `isChoosableTarget` is the
 * athlete's rule rather than the matcher's — they may complete a session they
 * had skipped or that a Rest day displaced, because the file is evidence they
 * did it. A completed session is the one thing they cannot overwrite.
 */
async function resolveChosenTarget(
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
  if (!isChoosableTarget(row, date)) return null;
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
  /** The session the athlete chose, or null to add this as a new one. */
  targetSessionId: string | null;
  body: number;
  mind: number;
  comment: string | null;
}): Promise<AcceptResult> {
  const { athleteId, activityId, targetSessionId, body, mind, comment } = params;

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

  // The athlete's choice, not the matcher's — the matcher's suggestion only
  // ever pre-selected a radio on the card. A chosen id that does not survive
  // re-checking is refused rather than quietly downgraded to "add a new one":
  // they picked a session, and silently doing something else to their calendar
  // is the class of behaviour this whole ticket is about.
  const target = targetSessionId
    ? await resolveChosenTarget(targetSessionId, athleteId, activity.date)
    : null;
  if (targetSessionId && !target) return { ok: false, reason: 'bad-target' };

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
      // What undo needs to put things back, kept where the record of what
      // happened already lives rather than in columns that exist to be read
      // once. `previousDuration` is the planned figure the device's actual
      // duration overwrites (retired garmin-sync/03); `activityType` and
      // `activityNote` are the proposal's own, which an in-place completion
      // does not write onto the session and which would otherwise be lost.
      payload: {
        sessionId,
        date: activity.date,
        matched: target !== null,
        previousDuration: target?.duration ?? null,
        activityType: activity.type,
        activityNote: activity.note,
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
 *
 * The activity is not discarded: it goes back to the pending list, so undo
 * means "let me decide this again" rather than "throw away what I uploaded".
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
      date: sessions.date,
      duration: sessions.duration,
      startTime: sessions.startTime,
      sport: sessions.sport,
      summary: sessions.summary,
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
  const payload = record.payload as {
    previousDuration?: number | null;
    activityType?: string;
    activityNote?: string | null;
  } | null;

  // The activity itself is still whole at this point — the session holds the
  // device's provenance and the stream row holds its samples — so undo puts it
  // back in the pending list rather than throwing it away. Undo then means
  // "let me decide this again", which is what an athlete who picked the wrong
  // session actually wants; discarding would make them find the file and
  // upload it a second time.
  const [stream] = await db
    .select({ samples: sessionStreams.samples })
    .from(sessionStreams)
    .where(eq(sessionStreams.sessionId, sessionId))
    .limit(1);

  await db.batch([
    db
      .update(sessions)
      .set({
        status: 'planned',
        parked: false,
        // Back to a Planned Session: the device data goes, and so does the
        // Reflection, because the Reflection *was* the acceptance.
        duration: payload?.previousDuration ?? null,
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
    db.insert(detectedActivities).values({
      athleteId,
      date: row.date,
      // The activity's own type and note, which an in-place completion never
      // wrote onto the session; the rest is read back off the session.
      type: payload?.activityType ?? row.sport ?? 'Other',
      note: payload?.activityNote ?? null,
      sport: row.sport,
      duration: row.duration,
      startTime: row.startTime,
      summary: row.summary,
      samples: stream?.samples ?? {},
      // Suggest the session it just came off — the athlete may well have meant
      // a different one, which is why they are here, but this is where it was.
      matchedSessionId: sessionId,
    }),
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
