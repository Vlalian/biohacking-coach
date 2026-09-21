import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { SEQ_RETRIES, isSeqConflict } from './seq-conflict';
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

/**
 * The Head Coach actions that are worth telling the athlete about.
 *
 * `session_moved` is here because ADR 0003's 2026-08-21 amendment gave the Head
 * Coach placement authority, and a coach silently rearranging someone's
 * training week is precisely the case "the plan never mutates silently by an
 * invisible hand" exists for. It shipped absent from this list, so the event was
 * recorded, matched by nothing, and told to no one.
 *
 * Adding it cannot narrate an athlete's own moves: the query below filters on
 * `actor_type = 'head_coach'`, and an athlete moving their own session stays
 * silent by design (CONTEXT.md).
 */
const NARRATABLE_TYPES = [
  'session_prescribed',
  'session_edited',
  'session_deleted',
  'session_moved',
  // A Head Coach renaming or re-bounding a Training Block
  // (`training-architecture/08`): the plan's structure changed by a hand that
  // is not the athlete's, which is exactly what the rule is for.
  'block_edited',
  // A Head Coach re-pinning a set the race moved out from under, or starting
  // it over from the draft (`training-architecture/19`): the same hand on the
  // same structure.
  'blocks_repinned',
  // The Head Coach moving the athlete's Weekly Session Day, and shaping the
  // drafted week before it reached them (`training-architecture/17`). The
  // second narrates only when something changed — an unchanged approval is
  // the coach nodding, not a hand on the plan — and that is decided in SQL
  // below, so an unchanged approval is never even read as pending.
  'weekly_session_day_set',
  'week_draft_approved',
] as const;

/**
 * The Coach's own actions on the plan's structure that the athlete is told
 * about (`training-architecture/07`): the Training Blocks it shaped, and the
 * rare flag that the race looks out of reach.
 *
 * Paired with `actor_type = 'coach_ai'` below, and only these two types. The
 * Coach writes other `coach_ai` events — a proposed week, for instance — that
 * are the conversation itself and must not be narrated back as if they were
 * news. Admitting an actor is not the mechanism; admitting a (actor, type) pair
 * is.
 */
const COACH_NARRATABLE_TYPES = ['blocks_drafted', 'race_flagged_unrealistic', 'week_drafted'] as const;

/**
 * The athlete's un-narrated plan changes by another hand, oldest first.
 *
 * Two hands: the Head Coach's session actions, and — since
 * `training-architecture/07` — the Coach's own block shaping. An athlete's own
 * Session Moves are silent by design (CONTEXT.md), and `system` events are
 * nobody's hand on the plan. Ordered oldest-first so a batch of pending events
 * narrates in the order they happened.
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
        isNull(events.narratedAt),
        or(
          and(
            eq(events.actorType, 'head_coach'),
            inArray(events.type, [...NARRATABLE_TYPES]),
            // An approval that changed nothing is the coach nodding, not a
            // hand on the plan: it is never pending, so it is never told.
            sql`(${events.type} <> 'week_draft_approved' OR ${events.payload} ->> 'changed' = 'true')`,
          ),
          and(eq(events.actorType, 'coach_ai'), inArray(events.type, [...COACH_NARRATABLE_TYPES])),
        ),
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
 * **`seq` is still read-then-write, so it retries.** The subquery picks
 * `MAX(seq) + 1` from this statement's snapshot, and a concurrent
 * `appendInOrder` for the same conversation — the athlete sending a message at
 * the moment narration fires on app-open — can pick the same number. The unique
 * index turns that into a failed write rather than a corrupted transcript, and
 * the whole statement is atomic, so a loser stamps nothing and simply tries
 * again. Bounded, and sharing {@link SEQ_RETRIES} with the append path rather
 * than keeping a second copy of the same rule (CodeRabbit, PR #39).
 *
 * Without the retry the narration was not lost, only deferred: the events stay
 * pending and narrate on the next app-open. The retry means the athlete does
 * not have to navigate twice to hear about it.
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
  const statement = sql`
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
  `;

  for (let attempt = 0; ; attempt++) {
    try {
      await db.execute(statement);
      return;
    } catch (error) {
      // Only a seq collision is worth repeating. Anything else — a dead
      // connection, a constraint this code got wrong — must surface rather than
      // be tried three times and swallowed.
      if (attempt >= SEQ_RETRIES || !isSeqConflict(error)) throw error;
    }
  }
}
