import {
  validateLayout,
  type SaveLayoutResult,
} from '@/features/information-view/save-layout';
import { updateCoachInformationViewLayout } from './coach-repository';

/**
 * Persists a coach's ONE roster-wide Information View layout (ADR 0004), once
 * validated. The same catalog rule as the athlete's (`validateLayout`, pure and
 * shared), a different destination — the coach row, never an athlete's.
 *
 * Kept in the coach feature so the dependency runs one way — coach → the pure
 * information-view validator — rather than the information-view feature reaching
 * into the coach repository.
 */
export async function saveCoachLayout(
  coachId: string,
  favorites: unknown,
  range: unknown,
): Promise<SaveLayoutResult> {
  const layout = validateLayout(favorites, range);
  if (!layout) return { ok: false, reason: 'invalid-layout' };
  await updateCoachInformationViewLayout(coachId, layout);
  return { ok: true };
}
