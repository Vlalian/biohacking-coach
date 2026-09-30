import { logWeekDraftClamped } from '@/lib/coach-log';
import type { PlanningWindow } from './planning-window';
import { clampToBand, isPlannableDay, type ProposedSession } from './weekly-session';

/**
 * The arithmetic's sessions the band counts: only those on the window's
 * plannable days (`training-architecture/48`), since a proposal can keep no
 * other.
 */
export function arithmeticInWindow<T extends { date: string }>(baseline: readonly T[], window: PlanningWindow): T[] {
  return baseline.filter((x) => isPlannableDay(x.date, window));
}

/**
 * A proposed week held to the band around the arithmetic's minutes
 * (`training-architecture/48`, R1/R2), with one log line when the clamp moved
 * it. Shared by the week draft and, since Mads's ruling of 2026-09-29, by a
 * week Momentum proposes in Coach Chat: both call the same `propose_week_plan`
 * tool, so both are held to the same band. Never a refusal — only the volume
 * is brought back.
 */
export function heldToBand(
  athleteId: string,
  sessions: ProposedSession[],
  baseline: readonly { durationMinutes: number | null }[],
  volumeReason: string | null,
): ProposedSession[] {
  const baselineMinutes = baseline.reduce((sum, x) => sum + (x.durationMinutes ?? 0), 0);
  const held = clampToBand(sessions, baselineMinutes, volumeReason);
  if (held.clamped) {
    const drafted = sessions.reduce((sum, x) => sum + (x.durationMinutes ?? 0), 0);
    logWeekDraftClamped(athleteId, { drafted, clampedTo: held.total, baseline: baselineMinutes, reasoned: volumeReason !== null });
  }
  return held.sessions;
}
