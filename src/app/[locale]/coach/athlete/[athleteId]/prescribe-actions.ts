'use server';

import { revalidatePath } from 'next/cache';
import { resolveHeadCoachId } from '../../../current-actor';
import {
  deletePrescribedSession,
  editPrescribedSession,
  prescribeSession,
  type HeadCoachActionResult,
  type PrescriptionInput,
} from '@/features/coach/head-coach-service';

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
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`);
  return result;
}

export async function editPrescribedSessionAction(
  athleteId: string,
  sessionId: string,
  input: PrescriptionInput,
  expectedVersion: number,
): Promise<PrescribeActionResult> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await editPrescribedSession({
    headCoachId,
    athleteId,
    sessionId,
    input,
    expectedVersion,
  });
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`);
  return result;
}

export async function deletePrescribedSessionAction(
  athleteId: string,
  sessionId: string,
  expectedVersion: number,
): Promise<PrescribeActionResult> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await deletePrescribedSession({
    headCoachId,
    athleteId,
    sessionId,
    expectedVersion,
  });
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`);
  return result;
}
