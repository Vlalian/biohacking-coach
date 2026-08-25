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
 * Stamps the events as narrated and appends the Coach's message — atomically,
 * and only if this call is the one that claimed them.
 *
 * Both land or neither does: a stamp without a message loses the narration
 * silently, and a message without a stamp repeats it on the next app-open.
 *
 * **Why one statement rather than a batch.** This ran as a two-statement batch
 * until 2026-08-25, and it was wrong. The UPDATE re-asserted
 * `narrated_at IS NULL`, which stops an event being stamped twice — but the
 * INSERT sat beside it and did not depend on the UPDATE matching anything, so
 * it ran regardless. The shell runs on every navigation, so two renders race
 * here routinely:
 *
 *   1. A and B both read `pending = [e1]` before either writes.
 *   2. A stamps e1 and inserts its message at `seq = 5`.
 *   3. B's UPDATE matches **zero** rows — and B's INSERT still runs, taking
 *      `seq = 6`. The athlete reads the same narration twice.
 *
 * The `messages_conversation_seq_idx` unique index does not save it: it only
 * collides when both renders compute the same `MAX(seq)`, which is exactly the
 * case where neither has committed yet. Found by CodeRabbit on PR #39, after a
 * two-axis review had read the old comment's claim and accepted it — the
 * comment asserted the guarantee, the code never implemented it.
 *
 * So the claim and the message are now one statement. The data-modifying CTE
 * always runs; the INSERT is gated on it having claimed **every** requested
 * event, so a loser that claimed none writes nothing. The same `count = $n`
 * gate also refuses a partial claim rather than narrating a set someone else
 * has half-taken, and the UPDATE carries the same precondition so a partial
 * claim does not stamp either. `seq` stays a subquery: one statement, so there
 * is no read-then-write window to lose.
 *
 * **Not yet exercised against a real database.** The repository tests here mock
 * the driver, so they pin the shape of this statement and not its behaviour
 * under two live connections.
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
  const ids = sql.join(
    eventIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  // `coach_ai` because this is the Coach narrating the Head Coach's action, not
  // the Head Coach speaking — the attribution lives in the words (CONTEXT.md) —
  // and so it replays as an assistant turn in later chat history.
  await db.execute(sql`
    WITH free AS (
      SELECT ${events.id} FROM ${events}
      WHERE ${events.athleteId} = ${athleteId}::uuid
        AND ${events.id} IN (${ids})
        AND ${events.narratedAt} IS NULL
    ),
    claimed AS (
      UPDATE ${events} SET ${sql.identifier('narrated_at')} = now()
      WHERE ${events.athleteId} = ${athleteId}::uuid
        AND ${events.id} IN (${ids})
        AND ${events.narratedAt} IS NULL
        AND (SELECT count(*) FROM free) = ${eventIds.length}
      RETURNING ${events.id}
    )
    INSERT INTO ${messages} (
      ${sql.identifier('conversation_id')},
      ${sql.identifier('role')},
      ${sql.identifier('content')},
      ${sql.identifier('seq')}
    )
    SELECT
      ${conversationId}::uuid,
      'coach_ai',
      ${content},
      (SELECT COALESCE(MAX(${messages.seq}) + 1, 0) FROM ${messages}
        WHERE ${messages.conversationId} = ${conversationId}::uuid)
    WHERE (SELECT count(*) FROM claimed) = ${eventIds.length}
  `);
}
