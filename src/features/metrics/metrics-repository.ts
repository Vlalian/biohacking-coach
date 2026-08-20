import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { athlete, conversations, events, messages, sessions } from '@/db/schema';
import { weekStartOf } from '@/lib/date';
import type { MetricsInput } from './metrics';

/**
 * The reads behind the metrics script (`showable-version/05`, item 1).
 *
 * Read-only by construction — nothing here writes. Unlike every other
 * repository in the app this is deliberately **not** scoped to one signed-in
 * athlete: it is run from a terminal by the person running the test, over every
 * athlete at once. That is exactly why it selects opaque ids and never joins
 * `user`: the report must not be able to name anybody (ADR 0006).
 */

/** Every athlete id in the database, for the report to iterate. */
export async function getAllAthleteIds(): Promise<string[]> {
  const rows = await getDb().select({ id: athlete.id }).from(athlete);
  return rows.map((r) => r.id);
}

/**
 * Assembles one athlete's metrics input in four reads.
 *
 * Kept as whole-table reads per athlete rather than one clever aggregate query:
 * this runs occasionally over a handful of testers, so legibility is worth more
 * than speed, and the arithmetic lives in the pure module where it is tested.
 */
export async function getMetricsInput(athleteId: string): Promise<MetricsInput> {
  const db = getDb();

  const [sessionRows, chatTurnRows, weeklyTurnRows, moveRows] = await Promise.all([
    db
      .select({ date: sessions.date, status: sessions.status, ratedAt: sessions.ratedAt })
      .from(sessions)
      .where(eq(sessions.athleteId, athleteId)),

    // An athlete *turn* in Coach Chat — the "initiated" in the glossary
    // definition. A Coach Chat holding only Coach turns (narration, say) is not
    // the athlete reaching out, so the role filter is load-bearing.
    db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        sql`${conversations.athleteId} = ${athleteId}
            AND ${conversations.kind} = 'coach_chat'
            AND ${messages.role} = 'athlete'`,
      ),

    db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        sql`${conversations.athleteId} = ${athleteId}
            AND ${conversations.kind} = 'weekly_session'
            AND ${messages.role} = 'athlete'`,
      ),

    db
      .select({ createdAt: events.createdAt })
      .from(events)
      .where(
        sql`${events.athleteId} = ${athleteId} AND ${events.type} = 'session_moved'`,
      ),
  ]);

  const dayOf = (d: Date) => d.toISOString().slice(0, 10);

  const weeklySessionTurnsByWeek: Record<string, number> = {};
  for (const row of weeklyTurnRows) {
    const week = weekStartOf(dayOf(row.createdAt));
    weeklySessionTurnsByWeek[week] = (weeklySessionTurnsByWeek[week] ?? 0) + 1;
  }

  return {
    athleteId,
    sessions: sessionRows.map((s) => ({
      date: s.date,
      status: s.status,
      rated: s.ratedAt !== null,
    })),
    chatTurnWeeks: chatTurnRows.map((r) => weekStartOf(dayOf(r.createdAt))),
    weeklySessionTurnsByWeek,
    // "Activity" is the athlete doing something the app recorded — a session
    // that happened, or a turn they typed. A planned session they have not
    // reached yet is the app's intention, not their activity, so it is excluded
    // or retention would measure the length of the plan.
    activityDays: [
      ...sessionRows
        .filter((s) => s.status === 'completed' || s.status === 'skipped')
        .map((s) => s.date),
      ...chatTurnRows.map((r) => dayOf(r.createdAt)),
      ...weeklyTurnRows.map((r) => dayOf(r.createdAt)),
    ],
    moveEventDates: moveRows.map((r) => dayOf(r.createdAt)),
  };
}
