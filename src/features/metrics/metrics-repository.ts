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

  const [sessionRows, chatTurnRows, weeklyTurnRows, moveRows, declinedRows] =
    await Promise.all([
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

    // Athlete turns in the retired kind. The Weekly Session stopped being a
    // behavior on 2026-09-16 (`training-architecture/21`) and nothing writes
    // `weekly_session` any more, but the rows already written are activity the
    // athlete really had, and dropping the read would make retention decay for
    // every tester who was here before the change. Kept, and kept out of the
    // engagement signal it never fed — see `activityDays` below.
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

    // The engagement signal from inside the Weekly Session: the athlete
    // cancelled the week the Coach proposed rather than accepting it (Mads,
    // 2026-08-21). `actor_type = 'athlete'` matters — `week_plan_declined` is
    // only ever written by the athlete's own cancel, but filtering on it keeps
    // that true if a future path ever declines on their behalf.
    db
      .select({ createdAt: events.createdAt })
      .from(events)
      .where(
        sql`${events.athleteId} = ${athleteId}
            AND ${events.type} = 'week_plan_declined'
            AND ${events.actorType} = 'athlete'`,
      ),
  ]);

  const dayOf = (d: Date) => d.toISOString().slice(0, 10);

  return {
    athleteId,
    sessions: sessionRows.map((s) => ({
      date: s.date,
      status: s.status,
      rated: s.ratedAt !== null,
    })),
    chatTurnWeeks: chatTurnRows.map((r) => weekStartOf(dayOf(r.createdAt))),
    planDeclinedWeeks: declinedRows.map((r) => weekStartOf(dayOf(r.createdAt))),
    // Weekly Session turns feed *activity* (retention) below and nothing else:
    // they were deliberately never an engagement signal, because the session
    // ran until the athlete agreed, so its length measured how long agreeing
    // took. Engagement is the Coach Chat read above — the one conversation
    // since the Weekly Session was retired — so it does not decay to zero now
    // that nothing new is written in the old kind.
    //
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
