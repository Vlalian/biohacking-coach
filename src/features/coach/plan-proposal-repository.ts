import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { events } from '@/db/schema';
import type { ProposedSession } from './weekly-session';
import {
  latestPlanWrittenAt,
  pendingProposal,
  PLAN_EVENT,
  type PlanProposalPayload,
} from './plan-proposal';

/**
 * The staging store for Week Plan proposals, over the append-only `events` log.
 *
 * A proposal, a confirmation, and a cancellation are three event types on one
 * athlete's log — no bespoke table, no migration. Every write is scoped to the
 * athlete resolved from the authenticated session upstream (ADR 0006). The
 * decision of whether a proposal is still pending is the pure {@link
 * pendingProposal}; this module only reads the rows and hands them to it.
 */

const PLAN_EVENT_TYPES = [PLAN_EVENT.proposed, PLAN_EVENT.written, PLAN_EVENT.declined];

/** Stages a proposal — the Coach proposed it, so the actor is the Coach AI. */
export async function recordProposal(
  athleteId: string,
  conversationId: string,
  sessions: ProposedSession[],
): Promise<void> {
  await getDb()
    .insert(events)
    .values({
      athleteId,
      actorType: 'coach_ai',
      type: PLAN_EVENT.proposed,
      payload: { conversationId, sessions },
    });
}

/** Records the athlete's confirmation of a proposal (they are the actor). */
export async function recordPlanCommitted(
  athleteId: string,
  conversationId: string,
  sessions: ProposedSession[],
): Promise<void> {
  await getDb()
    .insert(events)
    .values({
      athleteId,
      actorType: 'athlete',
      actorId: athleteId,
      type: PLAN_EVENT.written,
      payload: { conversationId, sessions },
    });
}

/** Records the athlete's cancellation of a proposal. */
export async function recordPlanDeclined(
  athleteId: string,
  conversationId: string,
): Promise<void> {
  await getDb()
    .insert(events)
    .values({
      athleteId,
      actorType: 'athlete',
      actorId: athleteId,
      type: PLAN_EVENT.declined,
      payload: { conversationId, sessions: [] },
    });
}

/** The proposal this conversation is currently awaiting a decision on, or null. */
export async function getPendingProposal(
  athleteId: string,
  conversationId: string,
): Promise<PlanProposalPayload | null> {
  const rows = await getDb()
    .select({ type: events.type, payload: events.payload, createdAt: events.createdAt })
    .from(events)
    .where(
      and(
        eq(events.athleteId, athleteId),
        inArray(events.type, PLAN_EVENT_TYPES),
        // Scope to this conversation in SQL, so the read stays bounded as an
        // athlete's plan-event history grows. pendingProposal filters again in
        // memory — belt and suspenders, and it needs the field to decide anyway.
        sql`${events.payload} ->> 'conversationId' = ${conversationId}`,
      ),
    )
    .orderBy(asc(events.createdAt));

  return pendingProposal(rows, conversationId);
}

/**
 * When this athlete's plan for the week starting `weekStart` was last written,
 * or null when no plan has been written for it (slice 09).
 *
 * Bounded in SQL to the athlete's `week_plan_written` events; which week a
 * write belongs to is decided in memory by {@link latestPlanWrittenAt}, because
 * the session dates live inside a jsonb array and a query over them would be
 * harder to read than the handful of rows an athlete accumulates.
 */
export async function getLatestPlanWrittenAt(
  athleteId: string,
  weekStart: string,
): Promise<Date | null> {
  const rows = await getDb()
    .select({ type: events.type, payload: events.payload, createdAt: events.createdAt })
    .from(events)
    .where(and(eq(events.athleteId, athleteId), eq(events.type, PLAN_EVENT.written)))
    .orderBy(asc(events.createdAt));
  return latestPlanWrittenAt(rows, weekStart);
}

/** What the athlete decided about a conversation's proposal, by name. */
export type PlanDecision = 'written' | 'declined';

/**
 * The newest decision on this conversation's proposals after `since`, or null
 * when none has been made (`training-architecture/24`).
 *
 * A week handed to a conversation is decided there, and the decision rows
 * carry a conversation, never a week — so the draft history asks this to
 * learn whether a discussed week was written, declined, or is still on the
 * table. Bounded to after the handoff: an earlier decision in the same chat
 * belongs to an earlier proposal.
 */
export async function latestPlanDecision(
  athleteId: string,
  conversationId: string,
  since: Date,
): Promise<PlanDecision | null> {
  const [row] = await getDb()
    .select({ type: events.type })
    .from(events)
    .where(
      and(
        eq(events.athleteId, athleteId),
        inArray(events.type, [PLAN_EVENT.written, PLAN_EVENT.declined]),
        sql`${events.payload} ->> 'conversationId' = ${conversationId}`,
        gt(events.createdAt, since),
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(1);
  if (!row) return null;
  return row.type === PLAN_EVENT.written ? 'written' : 'declined';
}
