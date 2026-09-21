'use server';

import { revalidatePath } from 'next/cache';
import { resolveHeadCoachId } from '../../../../current-actor';
import {
  editBlockAsHeadCoach,
  repinBlockSetAsHeadCoach,
  restartBlockSetFromDraftAsHeadCoach,
  type EditBlockResult,
  type RepinBlockSetServiceResult,
} from '@/features/coach/training-block-service';
import type { BlockEditInput } from '@/features/coach/training-blocks';
import { today } from '@/lib/date';

/**
 * The server actions behind the Head Coach's hand on the Training Blocks: the
 * edit (`training-architecture/08`) — this file is the **only production
 * caller** of `editBlockAsHeadCoach`, a structural test says so — and the two
 * repairs the login popup offers for a set the race moved out from under
 * (`/19`). The acting coach is resolved from the session, never the request:
 * the client sends what to change, the server decides who is changing it and
 * whether they may.
 */

export type EditBlockActionResult = EditBlockResult | { ok: false; reason: 'not-a-coach' };

export type RepinBlockSetActionResult = RepinBlockSetServiceResult | { ok: false; reason: 'not-a-coach' };

export async function editBlockAction(
  athleteId: string,
  raceId: string,
  position: number,
  input: BlockEditInput,
  expectedVersion: number,
): Promise<EditBlockActionResult> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await editBlockAsHeadCoach({
    headCoachId,
    athleteId,
    raceId,
    position,
    input,
    expectedVersion,
    // The server's clock, like every other Head Coach action: a materialised
    // draft starts today by the server's reckoning, not a browser's.
    today: today(),
  });
  // 'layout': the blocks show on the plan tab and in the Briefing's material,
  // so a page-scoped revalidate would leave the other tab stale.
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`, 'layout');
  return result;
}

/**
 * One click from the popup: re-pin the set's last block to the race's new
 * date. `expectedVersion` is the version the popup showed, so a set that
 * changed since is refused with what won (ADR 0010) rather than overwritten.
 */
export async function repinBlockSetAction(
  athleteId: string,
  raceId: string,
  expectedVersion: number,
): Promise<RepinBlockSetActionResult> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await repinBlockSetAsHeadCoach({ headCoachId, athleteId, raceId, expectedVersion, today: today() });
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`, 'layout');
  return result;
}

/** The other button: a set too stale to re-pin is replaced by the arithmetic draft from today. */
export async function restartBlockSetAction(
  athleteId: string,
  raceId: string,
  expectedVersion: number,
): Promise<RepinBlockSetActionResult> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await restartBlockSetFromDraftAsHeadCoach({
    headCoachId,
    athleteId,
    raceId,
    expectedVersion,
    today: today(),
  });
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`, 'layout');
  return result;
}
