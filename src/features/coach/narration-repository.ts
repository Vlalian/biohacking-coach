import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { events, messages } from '@/db/schema';
import type { NarratableEvent } from './narration';

/**
 * The read and write halves of narration (ticket `coached-mode/03`).
 *
 * `events.narrated_at` was built as the un-bench hook: Head Coach actions have
 * always been recorded with attribution and never announced, so this repository
 * is the pair of queries that closes that — read what is pending, then stamp it
 * and say it, in one batch.
 *
 * Both queries are scoped to the athlete id resolved from the authenticated
 * session upstream, in the WHERE itself (ADR 0006). A forged athlete id matches
 * no rows rather than reaching someone else's plan history.
 */

/** The three Head Coach actions that are worth telling the athlete about. */
const NARRATABLE_TYPES = [
  'session_prescribed',
  'session_edited',
  'session_deleted',
] as const;

/**
 * The athlete's un-narrated Head Coach actions, oldest first.
 *
 * Only `head_coach` events are pending: an athlete's own Session Moves are
 * silent by design (CONTEXT.md), and `system`/`coach_ai` events are not
 * somebody else's hand on the plan. Ordered oldest-first so a batch of pending
 * events narrates in the order they happened.
 */
export async function getPendingNarrationEvents(
  athleteId: string,
): Promise<NarratableEvent[]> {
  const rows = await getDb()
    .select({
      id: events.id,
      actorId: events.actorId,
      type: events.type,
      payload: events.payload,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(
      and(
        eq(events.athleteId, athleteId),
        eq(events.actorType, 'head_coach'),
        isNull(events.narratedAt),
        inArray(events.type, [...NARRATABLE_TYPES]),
      ),
    )
    .orderBy(asc(events.createdAt));

  return rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    type: row.type as NarratableEvent['type'],
    payload: row.payload,
    createdAt: row.createdAt,
  }));
}

/**
 * Stamps the events as narrated and appends the Coach's message, in one batch.
 *
 * Both land or neither does — the same guarantee, and the same mechanism, that
 * `head-coach-service` uses for its session write and its event. The order
 * matters less than the atomicity: a stamp without a message loses the
 * narration silently, and a message without a stamp repeats it on the next
 * app-open. A batch makes both impossible.
 *
 * The UPDATE re-asserts `narrated_at IS NULL` rather than trusting the ids it
 * was handed. Two View renders can race here — the shell runs on every
 * navigation — and this is what makes the loser write nothing instead of
 * narrating the same change twice. `seq` is computed in SQL from the
 * conversation's current maximum for the same reason: it is one statement, so
 * there is no read-then-write window to lose.
 */
export async function claimAndNarrate(params: {
  athleteId: string;
  eventIds: string[];
  conversationId: string;
  content: string;
}): Promise<void> {
  const { athleteId, eventIds, conversationId, content } = params;
  if (eventIds.length === 0) return;

  const db = getDb();
  await db.batch([
    db
      .update(events)
      .set({ narratedAt: new Date() })
      .where(
        and(
          eq(events.athleteId, athleteId),
          inArray(events.id, eventIds),
          isNull(events.narratedAt),
        ),
      ),
    db.insert(messages).values({
      conversationId,
      // The Coach narrating the Head Coach's action, not the Head Coach
      // speaking — the attribution lives in the words (CONTEXT.md). Stored as
      // `coach_ai` so it replays as an assistant turn in later chat history.
      role: 'coach_ai',
      content,
      seq: sql`(SELECT COALESCE(MAX(${messages.seq}) + 1, 0) FROM ${messages} WHERE ${messages.conversationId} = ${conversationId})`,
    }),
  ]);
}
