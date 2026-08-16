'use server';

import { revalidatePath } from 'next/cache';
import { resolveAthleteId, type AuthFailure } from './current-athlete';
import {
  completeSession,
  toggleSkipSession,
  toggleUnavailableSession,
  type SessionStatusResult,
} from '@/features/session/session-status';
import {
  createAthleteSession,
  updateAthleteSession,
  deleteAthleteSession,
  type CreateAthleteSessionResult,
  type AthleteSessionWriteResult,
} from '@/features/session/athlete-session';
import { dateKey, isValidDateKey } from '@/lib/date';

/**
 * Server actions for the Session Drawer's status controls (Mark complete,
 * Skip, Mark unavailable) and Athlete Session authoring. Each resolves the
 * acting athlete from the authenticated session — never from the request —
 * and re-derives `today` server-side so a client cannot forge the clock the
 * authority checks run against. All the authority lives in the
 * `@/features/session` services; these just wire the request to it and
 * revalidate the calendar on success, mirroring move-actions.ts / rate-actions.ts.
 */

export async function markCompleteAction(
  sessionId: string,
): Promise<SessionStatusResult | AuthFailure> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await completeSession({ athleteId, sessionId, today: dateKey(new Date()) });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function toggleSkipAction(
  sessionId: string,
): Promise<SessionStatusResult | AuthFailure> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await toggleSkipSession({ athleteId, sessionId, today: dateKey(new Date()) });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function toggleUnavailableAction(
  sessionId: string,
): Promise<SessionStatusResult | AuthFailure> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await toggleUnavailableSession({
    athleteId,
    sessionId,
    today: dateKey(new Date()),
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function createAthleteSessionAction(input: {
  date: string;
  type: string;
  durationMin: number | null;
  isTraining: boolean;
  note: string | null;
}): Promise<CreateAthleteSessionResult | AuthFailure> {
  if (!isValidDateKey(input.date)) return { ok: false, reason: 'invalid' };

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await createAthleteSession({
    athleteId,
    date: input.date,
    type: input.type,
    durationMin: input.durationMin,
    isTraining: input.isTraining,
    note: input.note,
    today: dateKey(new Date()),
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function updateAthleteSessionAction(
  sessionId: string,
  input: { type: string; durationMin: number | null; isTraining: boolean; note: string | null },
): Promise<AthleteSessionWriteResult | AuthFailure> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await updateAthleteSession({
    athleteId,
    sessionId,
    type: input.type,
    durationMin: input.durationMin,
    isTraining: input.isTraining,
    note: input.note,
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function deleteAthleteSessionAction(
  sessionId: string,
): Promise<AthleteSessionWriteResult | AuthFailure> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await deleteAthleteSession({ athleteId, sessionId });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
