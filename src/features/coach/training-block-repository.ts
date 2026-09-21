import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { athlete, coach, coachingLink, events, race, trainingBlockSet } from '@/db/schema';
import { user } from '@/db/auth-schema';
import { resolveAthleteName } from './coach-repository';
import type { TrainingBlockSpec } from './training-blocks';

/**
 * The stored Training Block set (`training-architecture/07`): one row per
 * (athlete, race), read by the resolver and written by the Coach's adjustment
 * (07) and the Head Coach's edit (08).
 *
 * Every WHERE carries the athlete id resolved upstream from the authenticated
 * session (ADR 0006), so a forged set id or race id matches no rows rather than
 * reaching someone else's plan.
 *
 * **Both writes are one CTE statement each**, with the `events` insert gated on
 * the block write having landed. `neon-http` has no interactive transactions,
 * and two statements would mean the event could announce a set that was never
 * written — the exact shape `claimAndNarrate` had until 2026-08-25. The tests
 * render the statements to SQL and assert the gate is there.
 */

export interface BlockSetRecord {
  id: string;
  athleteId: string;
  raceId: string;
  startDate: string;
  blocks: TrainingBlockSpec[];
  version: number;
}

/** The `events` row a block write announces itself with, when it does. */
export interface BlockSetEvent {
  actorType: 'coach_ai' | 'head_coach';
  /** The acting Head Coach's id; null for the Coach, which has none. */
  actorId: string | null;
  type: string;
  payload: Record<string, unknown>;
}

/** The set for this race, or null. */
export async function getBlockSet(athleteId: string, raceId: string): Promise<BlockSetRecord | null> {
  const [row] = await getDb()
    .select()
    .from(trainingBlockSet)
    .where(and(eq(trainingBlockSet.athleteId, athleteId), eq(trainingBlockSet.raceId, raceId)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    athleteId: row.athleteId,
    raceId: row.raceId,
    startDate: row.startDate,
    blocks: row.blocks as TrainingBlockSpec[],
    version: row.version,
  };
}

/**
 * The event half of a write statement — every event, each gated on the write
 * having landed, or nothing. One CTE per event: a set write can carry two (the
 * Coach's `blocks_drafted` and its rare `race_flagged_unrealistic`), and a
 * second statement after the first had committed could lose the verdict with
 * no retry able to restore it (CodeRabbit, PR #65).
 */
function eventCtes(athleteId: string, evts: BlockSetEvent[], gate: string) {
  return sql.join(
    evts.map(
      (event, i) => sql`,
    ${sql.identifier(`announced_${i}`)} AS (
      INSERT INTO ${events} (
        ${sql.identifier('athlete_id')},
        ${sql.identifier('actor_type')},
        ${sql.identifier('actor_id')},
        ${sql.identifier('type')},
        ${sql.identifier('payload')}
      )
      SELECT
        ${athleteId}::uuid,
        ${event.actorType},
        ${event.actorId}::uuid,
        ${event.type},
        ${JSON.stringify(event.payload)}::jsonb
      WHERE EXISTS (SELECT 1 FROM ${sql.identifier(gate)})
      RETURNING ${events.id}
    )`,
    ),
    sql``,
  );
}

/**
 * Writes a new set, or nothing if one already exists for this race.
 *
 * `ON CONFLICT DO NOTHING` on the (athlete, race) unique index is the whole
 * concurrency story: two background drafts racing for the same horizon both
 * insert, one loses, and the loser learns it from this call's answer rather
 * than from an exception. The event — the Coach announcing the blocks — rides
 * in the same statement and only where the insert landed, so a loser announces
 * nothing.
 */
export async function insertBlockSet(params: {
  athleteId: string;
  raceId: string;
  startDate: string;
  blocks: TrainingBlockSpec[];
  /** Announced in the same statement, only where the insert landed. */
  events?: BlockSetEvent[];
}): Promise<'inserted' | 'exists'> {
  const { athleteId, raceId, startDate, blocks, events: evts = [] } = params;

  const statement = sql`
    WITH inserted AS (
      INSERT INTO ${trainingBlockSet} (
        ${sql.identifier('athlete_id')},
        ${sql.identifier('race_id')},
        ${sql.identifier('start_date')},
        ${sql.identifier('blocks')}
      )
      VALUES (${athleteId}::uuid, ${raceId}::uuid, ${startDate}::date, ${JSON.stringify(blocks)}::jsonb)
      ON CONFLICT (${sql.identifier('athlete_id')}, ${sql.identifier('race_id')}) DO NOTHING
      RETURNING ${trainingBlockSet.id}
    )${eventCtes(athleteId, evts, 'inserted')}
    SELECT (SELECT count(*) FROM inserted) AS inserted
  `;

  const result = (await getDb().execute(statement)) as { rows: { inserted: string | number }[] };
  return Number(result.rows[0]?.inserted ?? 0) > 0 ? 'inserted' : 'exists';
}

export type CasBlockSetResult = { ok: true; version: number } | { ok: false; reason: 'conflict' };

/**
 * Replaces the blocks of a set, only if it is still at the version the caller
 * read; the event rides in the same statement and only where the update
 * matched. Zero rows matched means the set changed under the caller — the
 * answer is `conflict`, and the caller re-reads to show what won (ADR 0010).
 */
export async function casUpdateBlockSet(params: {
  athleteId: string;
  setId: string;
  expectedVersion: number;
  blocks: TrainingBlockSpec[];
  /**
   * A new first-block start, when the whole set was redrawn from a new day (the
   * Coach's redraft of a stale set). A Head Coach's edit leaves it out: it moves
   * one boundary inside a set whose start is already true.
   */
  startDate?: string;
  /** Announced in the same statement, only where the update matched. */
  events?: BlockSetEvent[];
}): Promise<CasBlockSetResult> {
  const { athleteId, setId, expectedVersion, blocks, startDate, events: evts = [] } = params;
  const startClause = startDate ? sql`, ${sql.identifier('start_date')} = ${startDate}::date` : sql``;

  const statement = sql`
    WITH updated AS (
      UPDATE ${trainingBlockSet}
      SET ${sql.identifier('blocks')} = ${JSON.stringify(blocks)}::jsonb${startClause},
          ${sql.identifier('version')} = ${trainingBlockSet.version} + 1,
          ${sql.identifier('updated_at')} = now()
      WHERE ${trainingBlockSet.id} = ${setId}::uuid
        AND ${trainingBlockSet.athleteId} = ${athleteId}::uuid
        AND ${trainingBlockSet.version} = ${expectedVersion}
      RETURNING ${trainingBlockSet.version}
    )${eventCtes(athleteId, evts, 'updated')}
    SELECT ${sql.identifier('version')} FROM updated
  `;

  const result = (await getDb().execute(statement)) as { rows: { version: number }[] };
  const row = result.rows[0];
  return row ? { ok: true, version: Number(row.version) } : { ok: false, reason: 'conflict' };
}

/** A stored set that no longer ends on its race's day, with what the popup names it by. */
export interface StaleBlockSet {
  set: BlockSetRecord;
  athleteName: string;
  raceName: string;
  raceDate: string;
}

/**
 * Every stale set on this user's Roster, in one statement
 * (`training-architecture/19`).
 *
 * Read by the app shell on every render for an account holding active
 * Coaching Links, so the shape is the whole cost: one SELECT scoped to the
 * user's active links, joined to each athlete's Target Race, with the stale
 * question — the last block's end is not race day, `fitsRace` in SQL — in the
 * WHERE, and only sets carrying at least one `head_coach` block (Mads,
 * 2026-09-19): a set the Coach alone drafted heals itself on the athlete's
 * next Training Plan visit, so it is not this coach's chore. Zero rows is the common case and costs one indexed read; there is no
 * per-athlete fan-out and no second read for the names, which ride the same
 * join through the one identity rule ({@link resolveAthleteName}).
 *
 * Scoped by the user id from the authenticated session, not a coach id from
 * a request: the shell has the session and nothing else, and a forged id
 * matches no links (ADR 0006).
 */
export async function getStaleBlockSetsForHeadCoach(userId: string): Promise<StaleBlockSet[]> {
  const statement = sql`
    SELECT
      ${trainingBlockSet.id} AS set_id,
      ${trainingBlockSet.athleteId} AS athlete_id,
      ${trainingBlockSet.raceId} AS race_id,
      ${trainingBlockSet.startDate} AS start_date,
      ${trainingBlockSet.blocks} AS blocks,
      ${trainingBlockSet.version} AS version,
      ${race.name} AS race_name,
      ${race.date} AS race_date,
      ${user.name} AS user_name,
      ${athlete.syntheticLabel} AS synthetic_label
    FROM ${trainingBlockSet}
    INNER JOIN ${coachingLink} ON ${coachingLink.athleteId} = ${trainingBlockSet.athleteId}
    INNER JOIN ${coach} ON ${coach.id} = ${coachingLink.coachId}
    INNER JOIN ${race} ON ${race.id} = ${trainingBlockSet.raceId}
    INNER JOIN ${athlete} ON ${athlete.id} = ${trainingBlockSet.athleteId}
    LEFT JOIN ${user} ON ${user.id} = ${athlete.userId}
    WHERE ${coach.userId} = ${userId}
      AND ${coachingLink.status} = 'active'
      AND ${race.isTarget}
      AND ${trainingBlockSet.blocks}->-1->>'endDate' <> ${race.date}::text
      AND jsonb_path_exists(${trainingBlockSet.blocks}, '$[*] ? (@.authoredBy == "head_coach")')
    ORDER BY ${race.date}, ${trainingBlockSet.athleteId}
  `;

  const result = (await getDb().execute(statement)) as {
    rows: {
      set_id: string;
      athlete_id: string;
      race_id: string;
      start_date: string;
      blocks: unknown;
      version: number;
      race_name: string;
      race_date: string;
      user_name: string | null;
      synthetic_label: string | null;
    }[];
  };
  return result.rows.map((row) => ({
    set: {
      id: row.set_id,
      athleteId: row.athlete_id,
      raceId: row.race_id,
      startDate: row.start_date,
      blocks: row.blocks as TrainingBlockSpec[],
      version: Number(row.version),
    },
    athleteName: resolveAthleteName(row.user_name, row.synthetic_label),
    raceName: row.race_name,
    raceDate: row.race_date,
  }));
}

/**
 * The reason the Coach last flagged this athlete's race as unrealistic, or
 * null. Read by the Briefing so the Head Coach hears it; the athlete already did
 * through narration. Latest first, one row — a race that was flagged twice has
 * one current reason.
 */
export async function getLatestUnrealisticFlag(athleteId: string, raceId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.athleteId, athleteId),
        eq(events.type, 'race_flagged_unrealistic'),
        // The verdict was about one race; a new Target Race starts clean
        // (CodeRabbit, PR #65).
        sql`${events.payload}->>'raceId' = ${raceId}`,
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(1);
  const reason = (row?.payload as { reason?: unknown } | null)?.reason;
  return typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : null;
}
