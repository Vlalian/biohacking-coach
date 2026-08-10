import { and, asc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, type NewSessionRow } from '@/db/schema';
import { addDays } from '@/lib/date';
import { toSession, type Session } from './session';

// These two row shapes deliberately mirror the Coach Briefing's own input types
// (`BriefingPlanEntry` and `toBriefingReflection`'s argument in
// `features/coach/briefing.ts`) field-for-field, but are declared here rather
// than imported: the session feature must not depend on the coach feature (the
// dependency runs one way, toward the core). The cost is that the two can drift —
// if a column is added to a projection here, add it to the briefing type too.

/** The plan columns a Coach Briefing may always read — no Session Reflection. */
export type BriefingPlanRow = {
  date: string;
  type: string;
  status: string;
  duration: number | null;
  zone: string | null;
  note: string | null;
};

/** The Session Reflection columns a Coach Briefing reads only when reports are shared. */
export type BriefingReflectionRow = {
  date: string;
  type: string;
  feedbackBody: number;
  feedbackMind: number;
  feedbackComment: string | null;
};

/**
 * The only place the app reads sessions out of Postgres.
 *
 * Scoped to one athlete by construction: the query filters on `athlete_id`, so
 * there is no shape of this call that returns another athlete's rows. That is
 * the athlete-scoping rule as a query, not a caller's responsibility to remember
 * (ADR 0006).
 *
 * Ordered by date then `day_order` so a day's sessions — a Double is two on one
 * date — come back in the order the calendar should show them.
 */
export async function getSessionsForAthlete(
  athleteId: string,
): Promise<Session[]> {
  const rows = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.athleteId, athleteId))
    .orderBy(asc(sessions.date), asc(sessions.dayOrder));

  return rows.map(toSession);
}

/**
 * Reads one athlete's sessions for a single Mon–Sun week, in calendar order.
 *
 * The Weekly Session reviews the week just lived (its Session Reflections and
 * skips), so it needs exactly that window. Scoped to the athlete by construction,
 * like {@link getSessionsForAthlete}.
 */
export async function getSessionsForWeek(
  athleteId: string,
  weekStartKey: string,
): Promise<Session[]> {
  const rows = await getDb()
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.athleteId, athleteId),
        gte(sessions.date, weekStartKey),
        lte(sessions.date, addDays(weekStartKey, 6)),
      ),
    )
    .orderBy(asc(sessions.date), asc(sessions.dayOrder));

  return rows.map(toSession);
}

/**
 * The plan sessions a Coach Briefing reads — the calendar, always visible with
 * no flag (ADR 0003). Selects ONLY the plan columns: the Session Reflection
 * fields are never in this projection, so a reports-off briefing cannot leak
 * them even by accident — the withheld data is not fetched, not fetched-then-
 * stripped (slice 13 AC). Scoped to the athlete by construction, in calendar
 * order.
 */
export async function getBriefingPlan(
  athleteId: string,
): Promise<BriefingPlanRow[]> {
  return getDb()
    .select({
      date: sessions.date,
      type: sessions.type,
      status: sessions.status,
      duration: sessions.duration,
      zone: sessions.zone,
      note: sessions.note,
    })
    .from(sessions)
    .where(eq(sessions.athleteId, athleteId))
    .orderBy(asc(sessions.date), asc(sessions.dayOrder));
}

/**
 * The athlete's Session Reflections for a Coach Briefing — the Body/Mind scores
 * and comment the athlete reported, which `shareAthleteReports` governs. This
 * function is CALLED only when that flag is on (the service is the gate), so the
 * reflection rows are never fetched when withheld. Reads only rated sessions —
 * an unrated one carries no reflection — in calendar order.
 */
export async function getBriefingReflections(
  athleteId: string,
): Promise<BriefingReflectionRow[]> {
  const rows = await getDb()
    .select({
      date: sessions.date,
      type: sessions.type,
      feedbackBody: sessions.feedbackBody,
      feedbackMind: sessions.feedbackMind,
      feedbackComment: sessions.feedbackComment,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.athleteId, athleteId),
        isNotNull(sessions.feedbackBody),
        isNotNull(sessions.feedbackMind),
      ),
    )
    .orderBy(asc(sessions.date), asc(sessions.dayOrder));

  // The NOT NULL filter guarantees both scores are present; narrow the type.
  return rows.map((r) => ({
    date: r.date,
    type: r.type,
    feedbackBody: r.feedbackBody as number,
    feedbackMind: r.feedbackMind as number,
    feedbackComment: r.feedbackComment,
  }));
}

/**
 * Replaces the coach-planned sessions in a date range with a freshly agreed Week
 * Plan, atomically.
 *
 * Only `origin = 'coach'` rows within `[startKey, endKey]` are cleared — a
 * completed session the athlete already rated, a Garmin import, or a Head Coach's
 * prescription is never touched, so re-planning cannot erase what actually
 * happened. The range is the plan's own span, so a plan running from today into
 * next week replaces exactly that stretch and leaves days outside it alone.
 * Delete and insert land in one `db.batch` so a failure can never leave the range
 * half-written. An empty plan clears the range's coach sessions and inserts
 * nothing.
 */
export async function replaceCoachPlanForDateRange(
  athleteId: string,
  startKey: string,
  endKey: string,
  rows: NewSessionRow[],
): Promise<void> {
  const db = getDb();

  const clear = db
    .delete(sessions)
    .where(
      and(
        eq(sessions.athleteId, athleteId),
        eq(sessions.origin, 'coach'),
        gte(sessions.date, startKey),
        lte(sessions.date, endKey),
      ),
    );

  if (rows.length === 0) {
    await clear;
    return;
  }

  await db.batch([clear, db.insert(sessions).values(rows)]);
}
