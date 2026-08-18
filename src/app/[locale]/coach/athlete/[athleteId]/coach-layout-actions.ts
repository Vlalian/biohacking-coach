'use server';

import { resolveCoachId } from '../../../current-actor';
import { saveCoachLayout } from '@/features/coach/save-coach-layout';
import type { SaveLayoutResult } from '@/features/information-view/save-layout';

export type SaveCoachLayoutActionResult =
  | SaveLayoutResult
  | { ok: false; reason: 'not-authenticated' | 'not-a-coach' };

/**
 * Server action persisting the coach's ONE roster-wide Information View layout
 * (ADR 0004). The coach is resolved here from the authenticated session — the
 * client sends only the preference, never whose it is — so a coach editing
 * favorites while viewing an athlete writes the *coach* row, never the
 * athlete's. Validation lives in {@link saveCoachLayout}.
 */
export async function saveCoachLayoutAction(
  favorites: string[],
  range: string,
): Promise<SaveCoachLayoutActionResult> {
  const coachId = await resolveCoachId();
  if (!coachId) return { ok: false, reason: 'not-a-coach' };

  return saveCoachLayout(coachId, favorites, range);
}
