'use server';

import { revalidatePath } from 'next/cache';
import { resolveHeadCoachId } from '../../../../current-actor';
import {
  deletePrescribedSession,
  moveSessionAsHeadCoach,
  editPrescribedSession,
  prescribeSession,
  type HeadCoachActionResult,
  type PrescriptionInput,
} from '@/features/coach/head-coach-service';
import type { MoveResult } from '@/features/session/session-move';
import { dateKey } from '@/lib/date';

/**
 * Server actions for the Head Coach's plan edits — the seam the lean coach UI
 * calls. Each resolves the acting Head Coach from the authenticated session
 * (never the request), so the client sends only *what* to change, never *who*
 * is changing it. The link gate and the content-authority guards live in the
 * service; these wire the request to it and revalidate the athlete view so the
 * change shows.
 */

export type PrescribeActionResult =
  | HeadCoachActionResult
  | { ok: false; reason: 'not-a-coach' };

export async function prescribeSessionAction(
  athleteId: string,
  input: PrescriptionInput,
): Promise<PrescribeActionResult> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await prescribeSession({ headCoachId, athleteId, input });
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`, 'layout');
  return result;
}

export async function editPrescribedSessionAction(
  athleteId: string,
  sessionId: string,
  input: PrescriptionInput,
): Promise<PrescribeActionResult> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await editPrescribedSession({ headCoachId, athleteId, sessionId, input });
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`, 'layout');
  return result;
}

export async function deletePrescribedSessionAction(
  athleteId: string,
  sessionId: string,
): Promise<PrescribeActionResult> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await deletePrescribedSession({ headCoachId, athleteId, sessionId });
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`, 'layout');
  return result;
}

/**
 * A Session Move performed by the Head Coach (ADR 0003, 2026-08-21 amendment).
 *
 * Same shape as the actions above and as the athlete's own `moveSessionAction`:
 * the acting coach is resolved from the authenticated session, never sent by the
 * client, and `today` is the server's so the Move rules are judged against a
 * clock the browser cannot spoof. Revalidates the layout, so the moved session
 * is not stale on the other tabs.
 */
export async function moveSessionAsCoachAction(
  athleteId: string,
  sessionId: string,
  targetDate: string,
): Promise<MoveResult | { ok: false; reason: 'not-linked' | 'not-a-coach' }> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await moveSessionAsHeadCoach({
    headCoachId,
    athleteId,
    sessionId,
    targetDate,
    today: dateKey(new Date()),
  });

  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`, 'layout');
  return result;
}
