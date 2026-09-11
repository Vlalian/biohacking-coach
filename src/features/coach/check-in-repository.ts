import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { checkIns, type CheckInRow } from '@/db/schema';

/**
 * The Check-in, read and written (`training-architecture/05`).
 *
 * One per athlete per week. The Weekly Session is not a gate (ADR 0007), so an
 * athlete may skip it — `null` is the ordinary answer for most weeks, not a
 * failure, and every caller has to render that rather than assume a report.
 */

/** What the athlete reports. All three scores together, or not at all. */
export interface CheckInReport {
  energy: number;
  body: number;
  sleepQuality: number;
  /** In the athlete's own words, or nothing. Never a score. */
  notableSignal: string | null;
}

/**
 * Fails closed on anything that is not a whole Check-in.
 *
 * A runtime assertion rather than a convention, for the reason
 * `code-health/07` exists: a half-filled readiness rendered as *no* readiness
 * at all **and** had the prompt tell the model there was none — a false claim in
 * the opposite direction, and the harder of the two to notice. The declared
 * TypeScript shape is erased at runtime, so a server action's payload can be
 * anything; this is the seam where it stops being anything.
 *
 * The database repeats the range check. Both, deliberately: the constraint is
 * the guarantee, this is the readable error.
 */
function assertCompleteReport(report: CheckInReport): void {
  for (const field of ['energy', 'body', 'sleepQuality'] as const) {
    const value = report[field];
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      throw new Error(
        `Check-in is not complete: ${field} must be a whole score from 1 to 10, got ${String(value)}. ` +
          'Half a Check-in is not a Check-in — it would render to the Coach as none at all.',
      );
    }
  }
}

/** The athlete's Check-in for a week, or null when they did not file one. */
export async function getCheckInForWeek(
  athleteId: string,
  weekStart: string,
): Promise<CheckInRow | null> {
  const rows = await getDb()
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.athleteId, athleteId), eq(checkIns.weekStart, weekStart)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Files the athlete's Check-in for a week, replacing any earlier one.
 *
 * An upsert rather than a read-then-branch: an athlete correcting Monday's
 * answer on Tuesday is editing one report, not filing two, and the unique index
 * on (athlete, week) is what makes that true at the database rather than in a
 * window between two round trips.
 */
export async function saveCheckIn(
  athleteId: string,
  weekStart: string,
  report: CheckInReport,
): Promise<void> {
  assertCompleteReport(report);
  await getDb()
    .insert(checkIns)
    .values({ athleteId, weekStart, ...report })
    .onConflictDoUpdate({
      target: [checkIns.athleteId, checkIns.weekStart],
      set: { ...report, updatedAt: new Date() },
    });
}
