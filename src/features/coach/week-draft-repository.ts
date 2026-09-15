import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { events } from '@/db/schema';
import type { Citation } from '@/lib/citation';
import { pendingWeekDraft, WEEK_DRAFT_EVENT, type SkeletonDay, type WeekDraft } from './week-draft';
import type { ProposedSession } from './weekly-session';

/**
 * The staging store for silently drafted weeks (`training-architecture/16`),
 * over the append-only `events` log — the same home the Weekly Session's
 * proposals have (`plan-proposal-repository.ts`), keyed on `weekStart` instead
 * of a conversation because a silent draft has no conversation.
 *
 * Every read and write is scoped to the athlete id resolved from the
 * authenticated session upstream, in the `WHERE` itself (ADR 0006).
 */

/** The event types a week's draft history is read from. */
const WEEK_DRAFT_TYPES = [
  WEEK_DRAFT_EVENT.drafted,
  WEEK_DRAFT_EVENT.approved,
  WEEK_DRAFT_EVENT.withdrawn,
  'week_plan_written',
  'week_plan_declined',
];

/**
 * The draft a week is still waiting on, or null. Bounded in SQL to this
 * athlete and this `weekStart`; the decision itself is the pure
 * {@link pendingWeekDraft}.
 */
export async function getPendingWeekDraft(athleteId: string, weekStart: string): Promise<WeekDraft | null> {
  const rows = await getDb()
    .select({ id: events.id, type: events.type, payload: events.payload, createdAt: events.createdAt })
    .from(events)
    .where(
      and(
        eq(events.athleteId, athleteId),
        inArray(events.type, WEEK_DRAFT_TYPES),
        sql`${events.payload} ->> 'weekStart' = ${weekStart}`,
      ),
    )
    .orderBy(asc(events.createdAt));

  return pendingWeekDraft(rows, weekStart);
}

export interface NewWeekDraft {
  athleteId: string;
  weekStart: string;
  visibleFrom: string;
  sessions: ProposedSession[];
  citations: Citation[];
  skeleton: SkeletonDay[];
}

/**
 * Stages a drafted week as the Coach — unless one is already pending for that
 * week.
 *
 * The check-and-claim for two tabs opening together: the insert is guarded by
 * `NOT EXISTS` over the same athlete's `week_drafted` rows for this `weekStart`
 * that no later written / declined / withdrawn event has resolved. One
 * statement, so there is no read-then-write window for a second run to slip
 * through; the loser learns it from the row count, not from an exception.
 *
 * `actor_id` is null: the Coach has no id to name, and the narration for this
 * event names no human by construction (`narration.ts:coachClause`).
 */
export async function recordWeekDraft(draft: NewWeekDraft): Promise<'drafted' | 'exists'> {
  const { athleteId, weekStart, visibleFrom, sessions, citations, skeleton } = draft;
  const payload = { weekStart, visibleFrom, sessions, citations, skeleton };

  const statement = sql`
    INSERT INTO ${events} (
      ${sql.identifier('athlete_id')},
      ${sql.identifier('actor_type')},
      ${sql.identifier('type')},
      ${sql.identifier('payload')}
    )
    SELECT
      ${athleteId}::uuid,
      'coach_ai',
      ${WEEK_DRAFT_EVENT.drafted},
      ${JSON.stringify(payload)}::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM ${events} AS drafted
      WHERE drafted.${sql.identifier('athlete_id')} = ${athleteId}::uuid
        AND drafted.${sql.identifier('type')} = ${WEEK_DRAFT_EVENT.drafted}
        AND drafted.${sql.identifier('payload')} ->> 'weekStart' = ${weekStart}
        AND NOT EXISTS (
          SELECT 1 FROM ${events} AS resolved
          WHERE resolved.${sql.identifier('athlete_id')} = ${athleteId}::uuid
            AND resolved.${sql.identifier('type')} IN ('week_plan_written', 'week_plan_declined', ${WEEK_DRAFT_EVENT.withdrawn})
            AND resolved.${sql.identifier('payload')} ->> 'weekStart' = ${weekStart}
            AND resolved.${sql.identifier('created_at')} > drafted.${sql.identifier('created_at')}
        )
    )
    RETURNING ${events.id}
  `;

  const result = (await getDb().execute(statement)) as { rows: unknown[] };
  return result.rows.length > 0 ? 'drafted' : 'exists';
}
