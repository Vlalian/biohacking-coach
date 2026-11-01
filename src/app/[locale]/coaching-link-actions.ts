'use server';

import { revalidatePath } from 'next/cache';
import { resolveAthleteId } from './current-actor';
import { grantConsent } from '@/features/consent/consent-repository';
import { activatePendingLink, declinePendingLink } from '@/features/coach/coach-repository';

/**
 * The athlete's answer to a pending Coaching Link (`training-architecture/14`,
 * Mads 2026-10-31). A link starts pending and the coach sees nothing until the
 * athlete grants the Head-Coach-visibility consent here; declining severs it.
 *
 * The athlete is resolved from the session, never the payload (ADR 0006). The
 * link id is client-supplied, so the repository moves only a pending link the
 * athlete owns; anything else comes back `not-pending`.
 *
 * Accepting is two writes: the consent, then the link. If the second fails, the
 * athlete has consented with the link still pending — harmless, and accepting
 * again finishes it, since granting a consent already held changes nothing.
 */

export type CoachingLinkAnswerResult =
  | { ok: true }
  | { ok: false; reason: 'not-authenticated' | 'not-pending' };

export async function acceptCoachingLinkAction(linkId: string): Promise<CoachingLinkAnswerResult> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  await grantConsent(athleteId, 'head_coach_visibility');
  if (!(await activatePendingLink(athleteId, linkId))) return { ok: false, reason: 'not-pending' };

  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function declineCoachingLinkAction(linkId: string): Promise<CoachingLinkAnswerResult> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  if (!(await declinePendingLink(athleteId, linkId))) return { ok: false, reason: 'not-pending' };

  revalidatePath('/', 'layout');
  return { ok: true };
}
