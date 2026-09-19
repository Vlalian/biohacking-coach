import { and, count, eq, isNotNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { checkIns, sessions } from '@/db/schema';
import { presenceStage, reflectionWeeksOf, type PresenceStage } from './presence';

/**
 * The reads behind the Presence Arc (`training-architecture/21`): what the
 * Coach actually has on this athlete. Two reads, the arithmetic in
 * {@link presence}, where it is tested without a database.
 *
 * Both are athlete-scoped by id (ADR 0006); neither reads a name.
 */

/** The evidence the stage is decided from. */
export interface PresenceEvidence {
  /** Distinct weeks holding at least one Session Reflection (a rated session). */
  reflectionWeeks: number;
  /** Check-ins filed, ever — one per week by construction. */
  checkIns: number;
}

export async function getPresenceEvidence(athleteId: string): Promise<PresenceEvidence> {
  const db = getDb();
  const [ratedRows, [checkInRow]] = await Promise.all([
    // Dates only: which week each rating falls in is `weekStartOf`'s call, and
    // keeping the week arithmetic in one place is worth the wider read.
    db
      .select({ date: sessions.date })
      .from(sessions)
      .where(and(eq(sessions.athleteId, athleteId), isNotNull(sessions.ratedAt))),
    db
      .select({ n: count() })
      .from(checkIns)
      .where(eq(checkIns.athleteId, athleteId)),
  ]);
  return {
    reflectionWeeks: reflectionWeeksOf(ratedRows.map((r) => r.date)),
    checkIns: checkInRow?.n ?? 0,
  };
}

/** The athlete's Presence Arc stage, read from their data. */
export async function getPresenceStage(athleteId: string): Promise<PresenceStage> {
  const evidence = await getPresenceEvidence(athleteId);
  return presenceStage(evidence.reflectionWeeks, evidence.checkIns);
}
