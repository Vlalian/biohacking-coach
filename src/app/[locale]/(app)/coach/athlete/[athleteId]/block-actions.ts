'use server';

import { revalidatePath } from 'next/cache';
import { resolveHeadCoachId } from '../../../../current-actor';
import {
  editBlockAsHeadCoach,
  type EditBlockResult,
} from '@/features/coach/training-block-service';
import type { BlockEditInput } from '@/features/coach/training-blocks';
import { today } from '@/lib/date';

/**
 * The one server action behind the Head Coach's Training Block edits
 * (`training-architecture/08`), and the **only production caller** of
 * `editBlockAsHeadCoach` — a structural test says so. The acting coach is
 * resolved from the session, never the request: the client sends what to
 * change, the server decides who is changing it and whether they may.
 */

export type EditBlockActionResult = EditBlockResult | { ok: false; reason: 'not-a-coach' };

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
