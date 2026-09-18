'use server';

import { revalidatePath } from 'next/cache';
import { resolveHeadCoachId } from '../../../../current-actor';
import { approveWeekDraft, coachDraftLanded, type ApproveResult } from '@/features/coach/head-coach-week-service';
import { today } from '@/lib/date';

/**
 * The Head Coach approves a drafted week, as drafted or as they edited it
 * (`training-architecture/17`). Approval is an event, never a calendar write —
 * the athlete's accept (`/18`) is the only thing that lands training. The acting
 * coach is resolved from the session; `changed` is computed on the server
 * against the stored draft and never taken from the client.
 */
export type ApproveActionResult = ApproveResult | { ok: false; reason: 'not-a-coach' };

export async function approveWeekDraftAction(
  athleteId: string,
  draftId: string,
  weekStart: string,
  sessions: unknown,
): Promise<ApproveActionResult> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await approveWeekDraft({
    headCoachId,
    athleteId,
    draftId,
    weekStart,
    sessions,
    // The server's clock, like every other Head Coach action.
    today: today(),
  });
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`, 'layout');
  return result;
}

/**
 * The coach page's poll read (`training-architecture/29`): has the previewed
 * week's draft landed? Behind the service's link gate; a caller with no coach
 * row is told "not yet". A read, so nothing to revalidate.
 */
export async function coachDraftLandedAction(athleteId: string, weekStart: string): Promise<boolean> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return false;
  return coachDraftLanded(headCoachId, athleteId, weekStart);
}
