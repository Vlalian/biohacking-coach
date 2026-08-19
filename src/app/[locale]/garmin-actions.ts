'use server';

import { revalidatePath } from 'next/cache';
import { resolveAthleteId } from './current-actor';
import {
  importGarminSessions,
  type ImportResult,
  type ImportFailure,
} from '@/features/garmin/garmin-import';

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
 * {@link importGarminSessions}; this wires the request to it and revalidates the
 * calendar when something landed.
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
  const result = await importGarminSessions({
    athleteId,
    filename: file.name,
    buffer,
  });

  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
