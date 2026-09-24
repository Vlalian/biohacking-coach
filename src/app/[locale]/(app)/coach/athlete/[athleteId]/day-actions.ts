'use server';

import { revalidatePath } from 'next/cache';
import { resolveHeadCoachId, resolveUserId } from '../../../../current-actor';
import { setWeekCycleInstructed } from '@/features/user-prefs/user-prefs-repository';
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

/**
 * The Head Coach dismisses the week-cycle explanation
 * (`training-architecture/41`). The flag is on the *user*, not the coach row:
 * the cycle is the same for every athlete they coach, so it is taught once, and
 * a dual-role person dismissing it as a coach changes nothing athlete-side.
 */
export type DismissWeekCycleResult = { ok: true } | { ok: false; reason: 'not-authenticated' };

export async function dismissWeekCycleAction(athleteId: string): Promise<DismissWeekCycleResult> {
  const userId = await resolveUserId();
  if (!userId) return { ok: false, reason: 'not-authenticated' };

  await setWeekCycleInstructed(userId);
  // 'layout': the card sits on the athlete's tabs, which the layout renders.
  revalidatePath(`/coach/athlete/${athleteId}`, 'layout');
  return { ok: true };
}
