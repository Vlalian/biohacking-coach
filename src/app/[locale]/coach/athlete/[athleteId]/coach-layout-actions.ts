'use server';

import { resolveHeadCoachId } from '../../../current-actor';
import { saveCoachLayout } from '@/features/coach/save-coach-layout';
import type { SaveLayoutResult } from '@/features/information-view/save-layout';

// Signed out and signed-in-but-not-a-Head-Coach both resolve to no coach row,
// and this action treats them the same: there is no Roster layout to write
// either way, and telling the two apart would leak whether an account exists.
// The union says only what the action can actually return.
export type SaveCoachLayoutActionResult =
  | SaveLayoutResult
  | { ok: false; reason: 'not-a-coach' };

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
  const coachId = await resolveHeadCoachId();
  if (!coachId) return { ok: false, reason: 'not-a-coach' };

  return saveCoachLayout(coachId, favorites, range);
}
