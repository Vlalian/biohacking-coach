'use server';

import { revalidatePath } from 'next/cache';
import { saveCheckIn } from '@/features/coach/check-in-repository';
import { weekStartOf, today } from '@/lib/date';
import {
  resolveAthleteWithLanguage as currentAthlete,
  type AuthFailure,
} from './current-actor';
import { isAthleteFault, normaliseNotableSignal } from './check-in-input';
import {
  commitWeeklyPlan,
  declineWeeklyPlan,
  type CommitResult,
  type DeclineResult,
} from '@/features/coach/weekly-session-service';

/**
 * Server actions for the week: filing the Check-in, and deciding on a proposed
 * Week Plan.
 *
 * Named for the Weekly Session that first owned them. That behavior is retired
 * (ADR 0007, amended 2026-09-16; `training-architecture/21`): the actions that
 * started and continued one are gone, and what remains is what outlived it —
 * the Check-in the overlay reminder files, and the confirm/cancel every
 * conversation's Action Proposal card lands on.
 *
 * The athlete is resolved here from the authenticated session — the client sends
 * only a conversation id or a report, never who they are. The service then
 * checks any client-supplied conversation id against that owner (ADR 0006), so
 * these actions add authentication and the service adds authority.
 */

export type CheckInResult = { ok: true } | AuthFailure | { ok: false; reason: 'invalid' };

/**
 * Files the athlete's Check-in for this week.
 *
 * Deliberately **not** gated on AI consent: nothing is sent anywhere by filing
 * one. It reaches a prompt only when the Coach next speaks, and that path has
 * its own gate. Refusing to let an athlete record how they feel because a
 * consent they have not yet given covers a thing they have not yet done would be
 * the gate doing something other than its job.
 *
 * The scores are validated again in the repository, which is what actually
 * refuses a partial one — this action's job is to say who is asking and which
 * week it is.
 */
export async function saveCheckInAction(report: {
  energy: number;
  body: number;
  sleepQuality: number;
  notableSignal: string | null;
}): Promise<CheckInResult> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;

  // A signal that is not text is the athlete's problem in the same way an
  // out-of-range score is - refused, not thrown at. What the judgement is lives
  // in `check-in-input.ts`, where it can be tested without a server.
  const notableSignal = normaliseNotableSignal(report.notableSignal);
  if (notableSignal === undefined) return { ok: false, reason: 'invalid' };

  try {
    await saveCheckIn(resolved.athlete.id, weekStartOf(today()), {
      ...report,
      notableSignal,
    });
  } catch (error) {
    if (isAthleteFault(error)) return { ok: false, reason: 'invalid' };
    throw error;
  }
  return { ok: true };
}

/** The athlete confirmed the proposal — write it and refresh the calendar. */
export async function commitWeeklyPlanAction(
  conversationId: string,
): Promise<CommitResult | AuthFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;

  const result = await commitWeeklyPlan(
    resolved.athlete,
    conversationId,
    today(),
  );
  // The confirmed plan lands in the calendar — refresh it so the new week shows.
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** The athlete cancelled the proposal — nothing is written. */
export async function declineWeeklyPlanAction(
  conversationId: string,
): Promise<DeclineResult | AuthFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;

  return declineWeeklyPlan(resolved.athlete, conversationId);
}
