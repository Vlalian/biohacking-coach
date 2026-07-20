'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import {
  importGarminSessions,
  type ImportResult,
} from '@/features/garmin/garmin-import';

export type UploadResult =
  | ImportResult
  | { ok: false; reason: 'not-authenticated' | 'empty' };

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

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, reason: 'not-authenticated' };

  const athlete = await getAthleteByUserId(session.user.id);
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await importGarminSessions({
    athleteId: athlete.id,
    filename: file.name,
    buffer,
  });

  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
