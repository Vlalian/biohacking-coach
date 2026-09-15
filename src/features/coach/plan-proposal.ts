import type { ProposedSession } from './weekly-session';
import { weekStartOf } from '@/lib/date';

/**
 * A staged Week Plan proposal — the Coach's proposal awaiting the athlete's
 * confirm-or-cancel decision. Nothing is written to the calendar until the
 * athlete confirms; this is what the confirmation popup shows.
 *
 * Proposals live in the append-only `events` log, not a bespoke table: a
 * `week_plan_proposed` event stages one, and a later `week_plan_written` or
 * `week_plan_declined` for the same conversation resolves it. That gives refresh
 * survival and an audit trail of what the Coach proposed and what the athlete
 * chose, for free.
 */

export const PLAN_EVENT = {
  proposed: 'week_plan_proposed',
  written: 'week_plan_written',
  declined: 'week_plan_declined',
} as const;

export interface PlanProposalPayload {
  conversationId: string;
  sessions: ProposedSession[];
}

/** The minimal event shape {@link pendingProposal} reads. */
export interface PlanEvent {
  type: string;
  payload: unknown;
  createdAt: Date;
}

function payloadOf(event: PlanEvent): PlanProposalPayload | null {
  const p = event.payload;
  // Stryker disable next-line ConditionalExpression,LogicalOperator: equivalent.
  // A truthy non-object has no `conversationId` string, so the next guard
  // returns null for it anyway; this line only spares that lookup.
  if (!p || typeof p !== 'object') return null;
  const rec = p as Record<string, unknown>;
  if (typeof rec.conversationId !== 'string' || !Array.isArray(rec.sessions)) return null;
  return { conversationId: rec.conversationId, sessions: rec.sessions as ProposedSession[] };
}

/**
 * The proposal a conversation is currently waiting on, or null.
 *
 * Walks the conversation's plan events oldest-first: a proposal becomes the
 * pending one, and a write or decline clears it. So the result is the last
 * proposal not yet resolved — exactly what the popup should show on load. Events
 * are filtered to `conversationId`, so one conversation's decision never resolves
 * another's proposal. Pure: events in, decision out.
 */
export function pendingProposal(
  events: PlanEvent[],
  conversationId: string,
): PlanProposalPayload | null {
  let pending: PlanProposalPayload | null = null;
  for (const event of events) {
    const payload = payloadOf(event);
    if (!payload || payload.conversationId !== conversationId) continue;
    if (event.type === PLAN_EVENT.proposed) pending = payload;
    else if (event.type === PLAN_EVENT.written || event.type === PLAN_EVENT.declined) {
      pending = null;
    }
  }
  return pending;
}

/**
 * When the plan covering `weekStart`'s week was last written, or null.
 *
 * "Written" only: a proposal the athlete never confirmed is not a plan, and a
 * decline is the absence of one. A written event belongs to the week if any of
 * its sessions falls in it — the Weekly Session writes one week at a time, so
 * this is the week it planned. Newest wins, because a re-planned week replaced
 * the earlier one (`weekly-actions.ts`).
 *
 * Slice 09 reads this to tell a race entered *after* the plan from one the plan
 * could have accommodated — the glossary's "middle case". Pure: rows in, an
 * instant out.
 */
export function latestPlanWrittenAt(events: PlanEvent[], weekStart: string): Date | null {
  const instants = events
    .filter((event) => event.type === PLAN_EVENT.written && writesWeek(event, weekStart))
    .map((event) => event.createdAt.getTime());
  return instants.length === 0 ? null : new Date(Math.max(...instants));
}

/** Whether a plan event's sessions fall in the week starting `weekStart`. */
function writesWeek(event: PlanEvent, weekStart: string): boolean {
  const payload = payloadOf(event);
  // `payloadOf` checks the list, not its entries: a stored `sessions: [null]`
  // must be skipped like any other malformed payload, not thrown on
  // (CodeRabbit, PR #67).
  return (
    payload !== null &&
    payload.sessions.some((s) => typeof s?.date === 'string' && weekStartOf(s.date) === weekStart)
  );
}
