'use server';

import { revalidatePath } from 'next/cache';
import type { HealthNoteRow } from '@/db/schema';
import { resolveHeadCoachId } from '../../../../current-actor';
import {
  addHealthNoteAsHeadCoach,
  readHealthAsHeadCoach,
  type HeadCoachHealthRefusal,
  type HealthSubject,
} from '@/features/health/health-service';

/**
 * The Head Coach's side of an athlete's detail thread
 * (`training-architecture/06`). Read and add — never declare, close or rate:
 * those are the athlete's statements about their own body.
 *
 * The coach is resolved from the session; `athleteId` is a claim the service
 * re-proves through an active Coaching Link that shares the athlete's reports,
 * so a tampered id buys nothing (ADR 0006). The thread is for human eyes only
 * (ADR 0011) — nothing read here can reach a prompt, because nothing here is on
 * one.
 */
export type CoachHealthActionResult =
  | { ok: true }
  | { ok: false; reason: HeadCoachHealthRefusal | 'not-a-coach' };

export async function addHealthNoteAsCoachAction(
  athleteId: string,
  subject: HealthSubject,
  body: string,
): Promise<CoachHealthActionResult> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };

  const result = await addHealthNoteAsHeadCoach(headCoachId, athleteId, subject, body);
  if (result.ok) revalidatePath(`/coach/athlete/${athleteId}`, 'layout');
  return result;
}

export async function readHealthNotesAsCoachAction(
  athleteId: string,
  subject: HealthSubject,
): Promise<
  { ok: true; notes: HealthNoteRow[] } | { ok: false; reason: HeadCoachHealthRefusal | 'not-a-coach' }
> {
  const headCoachId = await resolveHeadCoachId();
  if (!headCoachId) return { ok: false, reason: 'not-a-coach' };
  return readHealthAsHeadCoach(headCoachId, athleteId, subject);
}
