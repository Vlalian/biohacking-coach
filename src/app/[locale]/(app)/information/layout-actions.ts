'use server';

import { resolveAthleteId } from '../../current-actor';
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
  const athleteId = await resolveAthleteId();
  if (!athleteId) return { ok: false, reason: 'not-authenticated' };

  return saveLayout(athleteId, favorites, range);
}
