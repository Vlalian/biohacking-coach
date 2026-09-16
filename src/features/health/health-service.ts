import { getActiveLink } from '@/features/coach/coach-repository';
import { canSeeAthleteReports } from '@/features/coach/link-visibility';
import type { HealthNoteRow } from '@/db/schema';
import { addHealthNote, getHealthNotes } from './health-repository';

/**
 * The Head Coach's side of the detail thread (`training-architecture/06`).
 *
 * A Head Coach reaches an athlete's Injury or Illness through an **active
 * Coaching Link** whose visibility **shares the athlete's reports** — the same
 * flag slice 04 put the capacity statement behind in the Briefing, deliberately
 * not a third one. Both are proved here, before the repository is reached; the
 * repository's own `ownsSubject` then protects the athlete's id (ADR 0006). A
 * read and a write go through the same gate, so what a coach can see and what
 * they can add to are the same set.
 *
 * Mads, 2026-09-11: the Head Coach sees everything about the injury the athlete
 * sees — capacity, Bother Rating, the thread, the history. What they cannot do
 * is declare, close, or rate: those are the athlete's statements about their own
 * body.
 */
export type HeadCoachHealthRefusal = 'not-linked' | 'not-visible' | 'invalid';

export type HealthSubject = { injuryId: string } | { illnessId: string };

export async function addHealthNoteAsHeadCoach(
  headCoachId: string,
  athleteId: string,
  subject: HealthSubject,
  body: string,
): Promise<{ ok: true } | { ok: false; reason: HeadCoachHealthRefusal }> {
  const trimmed = body.trim();
  if (trimmed === '') return { ok: false, reason: 'invalid' };

  const gate = await visibilityGate(headCoachId, athleteId);
  if (gate) return { ok: false, reason: gate };

  await addHealthNote(athleteId, subject, 'head_coach', trimmed);
  return { ok: true };
}

export async function readHealthAsHeadCoach(
  headCoachId: string,
  athleteId: string,
  subject: HealthSubject,
): Promise<{ ok: true; notes: HealthNoteRow[] } | { ok: false; reason: HeadCoachHealthRefusal }> {
  const gate = await visibilityGate(headCoachId, athleteId);
  if (gate) return { ok: false, reason: gate };

  return { ok: true, notes: await getHealthNotes(athleteId, subject) };
}

/** Null when the coach may read this athlete's health; otherwise why not. */
async function visibilityGate(
  headCoachId: string,
  athleteId: string,
): Promise<'not-linked' | 'not-visible' | null> {
  const link = await getActiveLink(headCoachId, athleteId);
  if (!link) return 'not-linked';
  if (!canSeeAthleteReports(link.visibility)) return 'not-visible';
  return null;
}
