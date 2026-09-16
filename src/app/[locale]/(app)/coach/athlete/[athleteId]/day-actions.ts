'use server';

import { revalidatePath } from 'next/cache';
import { resolveHeadCoachId } from '../../../../current-actor';
import { setWeeklySessionDayAsHeadCoach, type SetDayResult } from '@/features/coach/head-coach-week-service';

/**
 * The Head Coach sets a linked athlete's Weekly Session Day
 * (`training-architecture/17`; ADR 0003 amendment 2026-09-14). The acting coach
 * is resolved from the session, never the request: the client sends the day,
 * the server decides who is setting it and whether they may.
 */
export type SetDayActionResult = SetDayResult | { ok: false; reason: 'not-a-coach' };

export async function setWeeklySessionDayAction(athleteId: string, day: string): Promise<SetDayActionResult> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await setWeeklySessionDayAsHeadCoach({ headCoachId, athleteId, day });
  // 'layout': the day decides which week the review panel shows, on the same tab.
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`, 'layout');
  return result;
}
