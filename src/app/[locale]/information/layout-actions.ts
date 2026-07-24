'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { saveLayout, type SaveLayoutResult } from '@/features/information-view/save-layout';

export type SaveLayoutActionResult =
  | SaveLayoutResult
  | { ok: false; reason: 'not-authenticated' };

/**
 * Server action persisting the Information View layout.
 *
 * The owning athlete is resolved here from the authenticated session — the
 * client sends only the preference, never whose it is. Validation lives in
 * {@link saveLayout}. No revalidation: the layout is view state the client
 * already holds; the next server render reads the row anyway.
 */
export async function saveLayoutAction(
  favorites: string[],
  range: string,
): Promise<SaveLayoutActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, reason: 'not-authenticated' };

  const athlete = await getAthleteByUserId(session.user.id);
  if (!athlete) return { ok: false, reason: 'not-authenticated' };

  return saveLayout(athlete.id, favorites, range);
}
