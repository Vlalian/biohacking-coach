import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, unavailableDates } from '@/db/schema';
import {
  sessionsToPark,
  sessionsToRestore,
  canMarkUnavailable,
} from './displacement';

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
 * engaged. When no session is parkable, only the date row is written.
 */
export async function markUnavailableDate(params: {
  athleteId: string;
  date: string;
  today: string;
}): Promise<AvailabilityResult> {
  const { athleteId, date, today } = params;
  if (!canMarkUnavailable(date, today)) return { ok: false, reason: 'past-date' };

  const db = getDb();

  const dayRows = await db
    .select({
      id: sessions.id,
      isTraining: sessions.isTraining,
      status: sessions.status,
    })
    .from(sessions)
    .where(and(eq(sessions.athleteId, athleteId), eq(sessions.date, date)));

  const parkIds = sessionsToPark(dayRows);

  // Idempotent: marking an already-unavailable day changes nothing. The composite
  // primary key (athlete, date) makes the conflict a no-op rather than an error.
  const markDate = db
    .insert(unavailableDates)
    .values({ athleteId, date })
    .onConflictDoNothing();

  if (parkIds.length === 0) {
    await markDate;
    return { ok: true };
  }

  await db.batch([
    markDate,
    db
      .update(sessions)
      .set({ status: 'unavailable', parked: true, updatedAt: new Date() })
      .where(inArray(sessions.id, parkIds)),
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
 * Athlete-scoped like {@link markUnavailableDate}. The date row is always
 * removed; the restore is the guarded part.
 */
export async function clearUnavailableDate(params: {
  athleteId: string;
  date: string;
  today: string;
}): Promise<AvailabilityResult> {
  const { athleteId, date, today } = params;
  const db = getDb();

  const dayRows = await db
    .select({ id: sessions.id, parked: sessions.parked })
    .from(sessions)
    .where(and(eq(sessions.athleteId, athleteId), eq(sessions.date, date)));

  const restoreIds = sessionsToRestore(dayRows, date, today);

  const clearDate = db
    .delete(unavailableDates)
    .where(
      and(
        eq(unavailableDates.athleteId, athleteId),
        eq(unavailableDates.date, date),
      ),
    );

  if (restoreIds.length === 0) {
    await clearDate;
    return { ok: true };
  }

  await db.batch([
    clearDate,
    db
      .update(sessions)
      .set({ status: 'planned', parked: false, updatedAt: new Date() })
      .where(inArray(sessions.id, restoreIds)),
  ]);

  return { ok: true };
}
