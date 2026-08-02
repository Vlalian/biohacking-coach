import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { events } from '@/db/schema';
import type { ProposedSession } from './weekly-session';
import {
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
