import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { events, trainingBlockSet } from '@/db/schema';
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

/** The event half of a write statement, or nothing — see the callers. */
function eventCte(athleteId: string, event: BlockSetEvent | undefined, gate: string) {
  if (!event) return sql``;
  return sql`,
    announced AS (
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
    )`;
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
  event?: BlockSetEvent;
}): Promise<'inserted' | 'exists'> {
  const { athleteId, raceId, startDate, blocks, event } = params;

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
    )${eventCte(athleteId, event, 'inserted')}
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
  event?: BlockSetEvent;
}): Promise<CasBlockSetResult> {
  const { athleteId, setId, expectedVersion, blocks, event } = params;

  const statement = sql`
    WITH updated AS (
      UPDATE ${trainingBlockSet}
      SET ${sql.identifier('blocks')} = ${JSON.stringify(blocks)}::jsonb,
          ${sql.identifier('version')} = ${trainingBlockSet.version} + 1,
          ${sql.identifier('updated_at')} = now()
      WHERE ${trainingBlockSet.id} = ${setId}::uuid
        AND ${trainingBlockSet.athleteId} = ${athleteId}::uuid
        AND ${trainingBlockSet.version} = ${expectedVersion}
      RETURNING ${trainingBlockSet.version}
    )${eventCte(athleteId, event, 'updated')}
    SELECT ${sql.identifier('version')} FROM updated
  `;

  const result = (await getDb().execute(statement)) as { rows: { version: number }[] };
  const row = result.rows[0];
  return row ? { ok: true, version: Number(row.version) } : { ok: false, reason: 'conflict' };
}

/**
 * One attributed event on its own — the second sentence a draft can carry
 * (`race_flagged_unrealistic`). The first rides inside the set write; this one
 * is written only after that write is known to have landed, by the caller.
 */
export async function insertBlockEvent(athleteId: string, event: BlockSetEvent): Promise<void> {
  await getDb().insert(events).values({
    athleteId,
    actorType: event.actorType,
    actorId: event.actorId,
    type: event.type,
    payload: event.payload,
  });
}

/**
 * The reason the Coach last flagged this athlete's race as unrealistic, or
 * null. Read by the Briefing so the Head Coach hears it; the athlete already did
 * through narration. Latest first, one row — a race that was flagged twice has
 * one current reason.
 */
export async function getLatestUnrealisticFlag(athleteId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ payload: events.payload })
    .from(events)
    .where(and(eq(events.athleteId, athleteId), eq(events.type, 'race_flagged_unrealistic')))
    .orderBy(desc(events.createdAt))
    .limit(1);
  const reason = (row?.payload as { reason?: unknown } | null)?.reason;
  return typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : null;
}
