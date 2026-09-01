import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
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
  /**
   * Which session of the day this is. Carried so two sessions with the same
   * type, duration and zone are still tellable apart on the card — on a Double
   * day they are otherwise rendered identically, and picking between two
   * identical labels is a coin flip, which is the problem this whole card was
   * built to remove. A Planned Session has no time of day to name it by:
   * `date` is a date and `startTime` is Garmin provenance that stays null until
   * an import writes it, so ordering is the only honest discriminator.
   */
  dayOrder: number;
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
  | { ok: false; reason: 'not-found' | 'not-owner' | 'invalid' | 'bad-target' | 'target-changed' };

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
    const options = onDay.map(({ id, type, status, duration, zone, dayOrder }) => ({
      id,
      type,
      status,
      duration,
      zone,
      dayOrder,
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
/**
 * The WHERE that decides whether an acceptance may land on the session the
 * athlete chose.
 *
 * Extracted and exported for one reason: **mutation testing could not see it
 * inline.** The status clause is the line this ticket turns on — it used to
 * read `status = 'planned'` while the card offered anything not completed, so
 * accepting onto a skipped session updated nothing and the activity was
 * destroyed silently. Written inline, a mutant flipping `ne` to `eq` killed no
 * test, because the repository mocks discard the predicate they are handed.
 * Rendered through `PgDialect` in the test, the clause is readable and the
 * mutation is caught.
 *
 * It mirrors {@link isChoosableTarget} deliberately: `completed` is the one
 * status neither the machine nor the athlete may overwrite, and everything the
 * athlete was offered must be writable or the offer was a lie. The two are
 * separate expressions of one rule — one in TypeScript over a row already read,
 * one in SQL over the row as it is at write time — and a test holds each.
 */
export function writableTargetWhere(sessionId: string, athleteId: string) {
  return and(
    eq(sessions.id, sessionId),
    eq(sessions.athleteId, athleteId),
    ne(sessions.status, 'completed'),
  );
}

/** The two events that between them say whether an import is currently in force. */
export const IMPORT_STATE_EVENTS = ['garmin_imported', 'garmin_import_undone'] as const;

/**
 * Both kinds of import event for one session, newest first — see
 * {@link isActiveImport} for why both.
 *
 * Exported for the same reason as {@link writableTargetWhere}: inline, a mutant
 * emptying the event-type list survived every test.
 */
export function importStateWhere(athleteId: string, sessionId: string) {
  return and(
    eq(events.athleteId, athleteId),
    inArray(events.type, [...IMPORT_STATE_EVENTS]),
    sql`${events.payload}->>'sessionId' = ${sessionId}`,
  );
}

/**
 * Whether the newest import event leaves an import in force.
 *
 * The log is read as a state machine rather than searched: whatever happened
 * last is what is true now. Asking instead for "the newest `garmin_imported`"
 * finds a stale one after import → undo → an ordinary manual completion, and
 * undoing *that* would reset a completion the athlete made themselves and put
 * back a proposal for a file already dealt with.
 */
export function isActiveImport(latest: { type: string } | undefined): boolean {
  return latest?.type === 'garmin_imported';
}

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
 * For an UNMATCHED activity all of it — the new session, the streams, the event
 * and the removal of the proposal — goes in one `db.batch`, so a half-accepted
 * activity cannot survive a failure.
 *
 * A MATCHED activity cannot have that, and the trade is deliberate. Its session
 * write is a guarded compare-and-set that has to be *checked* before the rest is
 * allowed to happen: if the target moved under us the proposal must survive, and
 * a batch would already have deleted it. So the update goes first, alone.
 *
 * What that costs: a failure between the two steps leaves the session completed
 * with no stream row and no import event, and the proposal still pending. That
 * state is visible and recoverable — the athlete can decline the proposal, or
 * add it as a new session — and it is a far better failure than the one this
 * replaces, which reported success and destroyed the activity silently.
 * `session-status.ts` already accepts the same exposure for the same reason.
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

  // A matched target is written FIRST and on its own, and the rest only happens
  // if it actually landed. Two things force that shape:
  //
  // 1. The predicate has to be the same one the athlete was offered. It used to
  //    be `status = 'planned'` while `isChoosableTarget` offers anything not
  //    completed — so picking a *skipped* session, which the card explicitly
  //    invites ("I skipped that in the app but I did it"), updated ZERO rows
  //    while the batch below still wrote the streams and the event and deleted
  //    the proposal. Success was reported, the session stayed skipped, and the
  //    activity was gone with no way back. The exact class of harm this ticket
  //    exists to remove, reintroduced in a narrower case.
  // 2. Even with the predicate fixed, the row is read in an earlier statement,
  //    so a completion landing in between must still lose. `ne(completed)`
  //    keeps that guard: a completed session is the one thing neither the
  //    machine nor the athlete may overwrite.
  //
  // Guarded compare-and-set, then check, then dependent writes — the same shape
  // `session-status.ts` uses for exactly this question.
  if (target) {
    const updated = await db
      .update(sessions)
      .set({ status: 'completed', parked: false, ...provenance, ...reflection })
      .where(writableTargetWhere(target.id, athleteId))
      .returning({ id: sessions.id });

    // Nothing else has run yet, so the proposal is still pending and the
    // athlete can decide again. Refusing loudly is the whole point.
    if (updated.length === 0) return { ok: false, reason: 'target-changed' };
  }

  const writes = [
    ...(target
      ? []
      : [
          db.insert(sessions).values({
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
          }),
        ]),
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
  ];

  await db.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);

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
  //
  // It asks for the LATEST event of either kind and requires it to be the
  // import, rather than asking for the latest import and hoping. Those differ
  // for a real sequence: import, undo, then the athlete completes that same
  // Coach-planned session by hand. The old import event is still the newest
  // `garmin_imported` for the session, and the guards above do not exclude it —
  // a Coach-planned session is `completed` and its origin is not `athlete`. So
  // undo would fire on an ordinary completion, reset it, and recreate a stale
  // proposal out of the old payload.
  //
  // Reading the two kinds together makes the log a state machine instead of a
  // search: whatever happened last is what is true now, and repeated
  // import/undo cycles need no extra rule.
  const [record] = await db
    .select({ type: events.type, payload: events.payload })
    .from(events)
    .where(importStateWhere(athleteId, sessionId))
    .orderBy(desc(events.createdAt))
    .limit(1);

  if (!isActiveImport(record)) return { ok: false, reason: 'not-imported' };
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
