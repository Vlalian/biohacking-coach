'use server';

import { revalidatePath } from 'next/cache';
import { resolveAthleteId } from './current-actor';
import {
  parseUpload,
  proposeDetectedActivities,
  type ImportResult,
  type ImportFailure,
} from '@/features/garmin/garmin-import';
import { importTrainingHistory, removeImportedHistory } from '@/features/garmin/history-import-service';
import type { ParsedSession } from '@/features/garmin/garmin';
import { today } from '@/lib/date';
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
  /** The session the athlete chose, or null to add the activity as a new one.
   *  Re-checked server-side against their own sessions — the id is a claim. */
  targetSessionId: string | null,
  rating: { body: number; mind: number; comment: string | null },
): Promise<AcceptResult | { ok: false; reason: 'not-authenticated' }> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const result = await acceptDetectedActivity({
    athleteId,
    activityId,
    targetSessionId,
    ...rating,
  });
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

/** A file in a history upload that could not be read, and why. */
export type HistoryFileFailure = { name: string; reason: ImportFailure };

export type HistoryUploadResult =
  | { ok: true; imported: number; proposed: number; failed: HistoryFileFailure[] }
  | { ok: false; reason: ActionFailure | 'locked' };

/**
 * Server action for the history upload (`garmin-integration/03`) — onboarding's
 * history step and Settings both call it.
 *
 * Every `file` entry is parsed on its own with the parser detection uses. A file
 * that fails is reported by name with its reason, and does not stop the rest:
 * every file that parsed is imported together, in one call, so the lock is set
 * once for the whole upload. The bytes are never kept and neither they nor the
 * names are logged; the names go back only to the athlete who sent them.
 */
export async function importHistoryAction(formData: FormData): Promise<HistoryUploadResult> {
  const files = formData.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, reason: 'empty' };

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const { parsed, failed } = await readAll(files);
  const result = await importTrainingHistory(athleteId, parsed, today());
  if (!result.ok) return result;
  if (parsed.length > 0) revalidatePath('/', 'layout');
  return { ...result, failed };
}

/** Every file parsed on its own: the activities of the ones that read, and why the others did not. */
async function readAll(files: readonly File[]): Promise<{ parsed: ParsedSession[]; failed: HistoryFileFailure[] }> {
  const parsed: ParsedSession[] = [];
  const failed: HistoryFileFailure[] = [];
  for (const file of files) {
    const read = await parseUpload(file.name, Buffer.from(await file.arrayBuffer()));
    if (read.ok) parsed.push(...read.sessions);
    else failed.push({ name: file.name, reason: read.reason });
  }
  return { parsed, failed };
}

/** Removes the imported history and re-opens the import (ballots 10–11). */
export async function removeImportedHistoryAction(): Promise<{ ok: true } | { ok: false; reason: 'not-authenticated' }> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  await removeImportedHistory(athleteId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

