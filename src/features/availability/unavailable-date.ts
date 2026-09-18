import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, unavailableDates } from '@/db/schema';
import { canMarkUnavailable, canRestoreOnClear } from './displacement';

/**
 * The result of marking or clearing an Unavailable Date. Marking can be refused
 * (a past day is not markable); clearing always succeeds — clearing a day that
 * was never marked is a no-op, not an error.
 */
export type AvailabilityResult =
  | { ok: true }
  | { ok: false; reason: 'past-date' };

/**
 * Marks a date unavailable under server authority (ADR 0006).
 *
 * The `athleteId` is the caller's own, derived upstream from the authenticated
 * session — never from the request body — so every query here is scoped to it
 * and no shape of this call reaches another athlete's rows. `today` is the
 * server's day, so the past-date boundary is judged against a clock the client
 * cannot spoof.
 *
 * Marking parks the day's training in place (Displacement): the date row and the
 * `status = 'unavailable', parked = true` flips land in one batch — both or
 * neither. The session's day is never changed, so the Move rules are never
 * engaged.
 *
 * **Which sessions park is decided by the statement, not by this process.** It
 * used to read the day, filter in memory, and write the resulting id list; the
 * read and the write were two round trips, and a concurrent `clear` landing
 * between them left the date row standing over planned, unparked sessions — a
 * day the Coach plans around while the calendar shows training on it. With the
 * read gone each operation is a single batch, which neon-http runs in a
 * transaction, so the two can no longer interleave *within* an operation. Run
 * concurrently they now resolve to one winner, and either end state is
 * internally consistent.
 *
 * An advisory lock was the alternative and is not available: it needs an
 * interactive transaction the http driver does not offer. The cost of this one
 * is that the selection rule lives in SQL rather than in a pure function — so it
 * is asserted as rendered SQL instead, and the rule stays covered.
 */
export async function markUnavailableDate(params: {
  athleteId: string;
  date: string;
  today: string;
}): Promise<AvailabilityResult> {
  const { athleteId, date, today } = params;
  if (!canMarkUnavailable(date, today)) return { ok: false, reason: 'past-date' };

  const db = getDb();

  await db.batch([
    // Idempotent: marking an already-unavailable day changes nothing. The
    // composite primary key (athlete, date) makes the conflict a no-op.
    db.insert(unavailableDates).values({ athleteId, date }).onConflictDoNothing(),
    db
      .update(sessions)
      // `parkedByDate` names this day as the reason: it is what lets the
      // clear below restore the day's own parking and nothing else.
      .set({ status: 'unavailable', parked: true, parkedByDate: date, updatedAt: new Date() })
      .where(
        and(
          eq(sessions.athleteId, athleteId),
          eq(sessions.date, date),
          // Only a *planned training* session is still-to-happen and so
          // genuinely displaced. A completed or skipped session is a resolved
          // record and is left alone — parking it would later restore it to
          // `planned` and lose what the athlete recorded, the record mutation
          // ADR 0002 forbids. Non-training sessions coexist with unavailability.
          eq(sessions.isTraining, true),
          eq(sessions.status, 'planned'),
        ),
      ),
  ]);

  return { ok: true };
}

/**
 * Clears an Unavailable Date, restoring that day's parked sessions to `planned`
 * in place — unless the day is past, in which case the sessions stay parked
 * because the unavailability genuinely happened and the record is immutable
 * (ADR 0002). The restore flips status in place and never changes a day, so the
 * Move rules are never engaged.
 *
 * Athlete-scoped and single-statement for the same reasons as
 * {@link markUnavailableDate}. The past-date rule is the one part that did *not*
 * move into SQL: it depends on the date alone and not on any row, so it stays a
 * plain guard in {@link canRestoreOnClear}, pure and unit-tested.
 */
export async function clearUnavailableDate(params: {
  athleteId: string;
  date: string;
  today: string;
}): Promise<AvailabilityResult> {
  const { athleteId, date, today } = params;
  const db = getDb();

  const clearDate = db
    .delete(unavailableDates)
    .where(
      and(
        eq(unavailableDates.athleteId, athleteId),
        eq(unavailableDates.date, date),
      ),
    );

  // The date row always goes; the restore is the guarded part.
  if (!canRestoreOnClear(date, today)) {
    await clearDate;
    return { ok: true };
  }

  await db.batch([
    clearDate,
    db
      .update(sessions)
      .set({ status: 'planned', parked: false, parkedByDate: null, updatedAt: new Date() })
      .where(
        and(
          eq(sessions.athleteId, athleteId),
          eq(sessions.date, date),
          // The exact inverse of the park above: the sessions *this day*
          // parked, and nothing else on it. A session the athlete marked
          // unavailable themselves is parked with `parkedByDate` null and is
          // not this flow's to restore — clearing the day must not undo a
          // decision the day never made (code-health issue 12).
          eq(sessions.parkedByDate, date),
        ),
      ),
  ]);

  return { ok: true };
}
