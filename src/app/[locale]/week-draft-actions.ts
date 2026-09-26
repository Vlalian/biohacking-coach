'use server';

import { revalidatePath } from 'next/cache';
import { assertAiCoachingConsent } from '@/features/consent/consent-gate';
import {
  acceptWeekDraft,
  declineWeekDraft,
  discussWeekDraft,
  type AcceptResult,
  type DeclineResult,
  type DiscussResult,
} from '@/features/coach/week-draft-decision-service';
import { draftLanded, redraftWeek, type DraftOutcome, type RedraftRefusal } from '@/features/coach/week-draft-service';
import { today } from '@/lib/date';
import { resolveAthleteWithLanguage as currentAthlete, type AuthFailure } from './current-actor';

/**
 * The athlete's three answers to a drafted week (`training-architecture/18`):
 * accept, discuss, decline. The athlete is resolved from the session, never
 * named by the request (ADR 0006); the draft id is the only thing the client
 * sends, and the service re-reads the draft the athlete can see before acting
 * on it. Only the tap commits (CONTEXT.md, Action Proposal).
 */

type ConsentFailure = { ok: false; reason: 'consent-required' };

export async function acceptWeekDraftAction(draftId: string): Promise<AcceptResult | AuthFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;
  const result = await acceptWeekDraft(resolved.athlete, draftId, today());
  // The accepted week lands in the calendar — refresh it so the sessions show.
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/**
 * `reason` is the athlete's one optional answer to why (`training-architecture/30`).
 * It arrives from the client, so the service checks it against the list.
 */
export async function declineWeekDraftAction(draftId: string, reason?: string): Promise<DeclineResult | AuthFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;
  const result = await declineWeekDraft(resolved.athlete, draftId, today(), reason);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/**
 * Hands the draft to the athlete's Coach Chat (`training-architecture/20`).
 * Gated on AI consent like every path that opens a conversation with the
 * Coach, even though this one makes no Coach call: the next turn will.
 */
export async function discussWeekDraftAction(draftId: string): Promise<DiscussResult | AuthFailure | ConsentFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;
  const gate = await assertAiCoachingConsent(resolved.athlete.id);
  if (!gate.ok) return { ok: false, reason: 'consent-required' };
  const result = await discussWeekDraft(resolved.athlete, draftId, today());
  // The proposal left the calendar for the conversation — the card becomes a pointer.
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export type RedraftResult =
  | { ok: true; outcome: 'drafted' }
  | { ok: false; reason: Exclude<DraftOutcome, 'drafted'> | RedraftRefusal };

/**
 * The athlete asks for a second draft of a week they declined
 * (`training-architecture/24`, decision 1 — the one way a week is drafted
 * twice). Consent-gated: it is a Coach call. The week is the only thing the
 * client sends; the service checks it is theirs to ask for.
 */
export async function redraftWeekAction(weekStart: string): Promise<RedraftResult | AuthFailure | ConsentFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;
  const gate = await assertAiCoachingConsent(resolved.athlete.id);
  if (!gate.ok) return { ok: false, reason: 'consent-required' };
  const outcome = await redraftWeek(resolved.athlete.id, weekStart, today());
  if (outcome !== 'drafted') return { ok: false, reason: outcome };
  // The new draft's card belongs in the calendar now.
  revalidatePath('/', 'layout');
  return { ok: true, outcome };
}

/**
 * The waiting card's read (`training-architecture/29`): has the week's draft
 * landed? A read, never a refresh — the card refreshes the page once, when
 * this says yes. A signed-out caller is told "not yet", not refused: the card
 * has nothing to do with the answer but wait.
 */
export async function draftLandedAction(weekStart: string): Promise<boolean> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return false;
  return draftLanded(resolved.athlete.id, weekStart);
}
