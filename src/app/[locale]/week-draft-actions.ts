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
import { dateKey } from '@/lib/date';
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
  const result = await acceptWeekDraft(resolved.athlete, draftId, dateKey(new Date()));
  // The accepted week lands in the calendar — refresh it so the sessions show.
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function declineWeekDraftAction(draftId: string): Promise<DeclineResult | AuthFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;
  const result = await declineWeekDraft(resolved.athlete, draftId, dateKey(new Date()));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/**
 * Starts a Weekly Session around the draft. Gated on AI consent like every
 * path that opens a conversation with the Coach (`startWeeklySessionAction`).
 */
export async function discussWeekDraftAction(draftId: string): Promise<DiscussResult | AuthFailure | ConsentFailure> {
  const resolved = await currentAthlete();
  if (!resolved.ok) return resolved;
  const gate = await assertAiCoachingConsent(resolved.athlete.id);
  if (!gate.ok) return { ok: false, reason: 'consent-required' };
  const result = await discussWeekDraft(resolved.athlete, draftId, dateKey(new Date()), resolved.language);
  // The proposal left the calendar for the conversation — the card becomes a pointer.
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
