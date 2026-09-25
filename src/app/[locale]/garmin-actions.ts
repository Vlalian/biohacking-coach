'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { resolveAthlete, resolveAthleteId, type AuthFailure } from './current-actor';
import { proposeDetectedUpload, type ImportResult, type ImportFailure } from '@/features/garmin/garmin-import';
import { latestHistoryImport, removeImportedHistory, startHistoryImport } from '@/features/garmin/history-import-service';
import { IMPORT_TIME_BUDGET_MS, runHistoryImport, timeBudget } from '@/features/garmin/history-import-worker';
import { blobWorkerDeps, deleteBlob, fetchBlob } from '@/features/garmin/blob-store';
import {
  blobPrefix,
  importSummary,
  isOwnBlobUrl,
  uploadPolicy,
  uploadState,
  type ImportSummary,
  type UploadKind,
  type UploadRefusal,
} from '@/features/garmin/blob-upload';
import {
  acceptDetectedActivity,
  declineDetectedActivity,
  undoDetectedImport,
  type AcceptResult,
  type DeclineResult,
  type UndoResult,
} from '@/features/garmin/detected-activity';

/**
 * The failures these actions decide themselves, before the importer is
 * reached. `not-yours` is a blob URL outside the signed-in athlete's own
 * prefix — the client names the file, so it is checked, never trusted.
 */
export type ActionFailure = 'not-authenticated' | 'empty' | 'not-yours';

/** Every way an upload can fail, including the ones above. */
export type UploadFailure = ImportFailure | ActionFailure;

/**
 * Derived from {@link ActionFailure} rather than repeating it: the two lists
 * drifting apart is how a failure reaches the UI with no message mapped to it.
 */
export type UploadResult = ImportResult | { ok: false; reason: ActionFailure };

/**
 * Where the signed-in athlete may put a Garmin upload (`garmin-integration/04`).
 *
 * Both uploads go browser → Vercel Blob, because a function body is capped at
 * 4.5 MB and a Garmin export is hundreds of MB. The client asks here first: it
 * learns its own prefix, and a history upload is refused before a single byte
 * moves when the lock is already taken. The token route applies the same
 * policy again when the upload itself asks for a token.
 */
export async function prepareGarminUploadAction(
  kind: UploadKind,
): Promise<{ ok: true; pathPrefix: string } | { ok: false; reason: UploadRefusal }> {
  const policy = uploadPolicy(kind, uploadState(await resolveAthlete()));
  return policy.ok ? { ok: true, pathPrefix: policy.pathPrefix } : policy;
}

/**
 * The detection upload, once its file is in Blob: read it, propose what it
 * holds as Detected Activities, delete it. Nothing has entered the training
 * record — the athlete accepts each proposal on the calendar.
 *
 * The owning athlete is resolved here from the authenticated session, and the
 * URL must sit under that athlete's detection prefix. The blob is deleted
 * whatever the outcome; the bytes are never kept or logged.
 */
export async function importDetectedFromBlobAction(blobUrl: string): Promise<UploadResult> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };
  if (!isOwnBlobUrl(blobUrl, blobPrefix('detection', athleteId))) return { ok: false, reason: 'not-yours' };

  try {
    const bytes = await fetchBlob(blobUrl);
    if (!bytes) return { ok: false, reason: 'unreadable' };
    const result = await proposeDetectedUpload({ athleteId, name: fileNameOf(blobUrl), bytes });
    if (result.ok) revalidatePath('/', 'layout');
    return result;
  } finally {
    await deleteQuietly(blobUrl);
  }
}

/** A failed delete does not fail the upload: the 24 h sweep takes what is left. */
async function deleteQuietly(blobUrl: string): Promise<void> {
  try {
    await deleteBlob(blobUrl);
  } catch {
    // Left for sweepOldBlobs.
  }
}

/** The uploaded file's name: the URL's last segment, unescaped. */
function fileNameOf(blobUrl: string): string {
  const path = new URL(blobUrl).pathname;
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
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

export type StartHistoryImportResult = { ok: true } | { ok: false; reason: 'empty' | 'not-authenticated' | 'not-yours' | 'locked' };

/**
 * *Import* on the history upload (`garmin-integration/03`, `04`) — onboarding's
 * history step and Settings both call it, once the files are in Blob.
 *
 * Every URL must be one of the athlete's own history uploads. Then the lock is
 * taken and the import opened, and reading starts in the background after the
 * response: as many 25-file steps as fit in the time budget, the rest left to
 * the cron. The athlete can leave; the screen polls
 * {@link historyImportStatusAction} for progress.
 */
export async function startHistoryImportAction(blobUrls: readonly string[]): Promise<StartHistoryImportResult> {
  if (!Array.isArray(blobUrls) || blobUrls.length === 0) return { ok: false, reason: 'empty' };

  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };
  const prefix = blobPrefix('history', athleteId);
  // Anything that is not a URL string fails `isOwnBlobUrl` too — it never parses.
  if (!blobUrls.every((url) => isOwnBlobUrl(url, prefix))) return { ok: false, reason: 'not-yours' };

  const started = await startHistoryImport(athleteId, blobUrls);
  if (!started.ok) return started;

  after(() => runHistoryImport(started.importId, blobWorkerDeps, timeBudget(IMPORT_TIME_BUDGET_MS)));
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Where the athlete's latest history import stands — counts only, never the blob URLs. */
export async function historyImportStatusAction(): Promise<{ ok: true; summary: ImportSummary | null } | AuthFailure> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  const latest = await latestHistoryImport(athleteId);
  return { ok: true, summary: latest ? importSummary(latest) : null };
}

/** Removes the imported history and re-opens the import (ballots 10–11). */
export async function removeImportedHistoryAction(): Promise<{ ok: true } | { ok: false; reason: 'not-authenticated' }> {
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  await removeImportedHistory(athleteId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

