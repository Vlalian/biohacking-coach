'use server';

import { revalidatePath } from 'next/cache';
import { resolveAthleteId } from './current-actor';
import {
  proposeDetectedActivities,
  type ImportResult,
  type ImportFailure,
} from '@/features/garmin/garmin-import';
import {
  acceptDetectedActivity,
  declineDetectedActivity,
  undoDetectedImport,
  type AcceptResult,
  type DeclineResult,
  type UndoResult,
} from '@/features/garmin/detected-activity';

/** The two failures this action decides itself, before the importer is reached. */
export type ActionFailure = 'not-authenticated' | 'empty';

/** Every way an upload can fail, including the two above. */
export type UploadFailure = ImportFailure | ActionFailure;

/**
 * Derived from {@link ActionFailure} rather than repeating it: the two lists
 * drifting apart is how a failure reaches the UI with no message mapped to it.
 */
export type UploadResult = ImportResult | { ok: false; reason: ActionFailure };

/**
 * Server action for a Garmin upload.
 *
 * The owning athlete is resolved here from the authenticated session — the
 * upload carries only the file. All parsing and the atomic write live in
 * {@link proposeDetectedActivities}; this wires the request to it and
 * revalidates so the new proposals appear. Nothing has entered the training
 * record at this point — the athlete has to accept them.
 */
export async function uploadGarminAction(
  formData: FormData,
): Promise<UploadResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, reason: 'empty' };
  }

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await proposeDetectedActivities({
    athleteId,
    filename: file.name,
    buffer,
  });

  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/**
 * Accept a proposed Detected Activity, with the Session Reflection that
 * commits it. The rating is not a step after accepting — it *is* the accept
 * (`CONTEXT.md`, Detected Activity).
 */
export async function acceptDetectedActivityAction(
  activityId: string,
  rating: { body: number; mind: number; comment: string | null },
): Promise<AcceptResult | { ok: false; reason: 'not-authenticated' }> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await acceptDetectedActivity({ athleteId, activityId, ...rating });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** Discard a proposed Detected Activity. The calendar is left as it was. */
export async function declineDetectedActivityAction(
  activityId: string,
): Promise<DeclineResult | { ok: false; reason: 'not-authenticated' }> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await declineDetectedActivity({ athleteId, activityId });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/**
 * Take back a completion made by accepting a Detected Activity — the way out
 * of a wrong file, since none of the ordinary session controls offers one.
 */
export async function undoDetectedImportAction(
  sessionId: string,
): Promise<UndoResult | { ok: false; reason: 'not-authenticated' }> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await undoDetectedImport({ athleteId, sessionId });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
