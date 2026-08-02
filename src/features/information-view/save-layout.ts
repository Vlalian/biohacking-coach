import { updateInformationViewLayout } from '@/features/athlete/athlete-repository';
import { RANGES, type InformationViewLayout, type RangeKey } from './layout';
import { PANEL_IDS } from './panels';

export type SaveLayoutResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-layout' };

/**
 * Decides whether a proposed layout is one the catalog recognises, returning
 * the normalised layout or `null`.
 *
 * The client proposes, the server disposes (ADR 0006): whatever arrived in the
 * request is untrusted until every favorite is a known panel id (deduplicated,
 * order kept) and the range is a known key. An unknown id is refused rather
 * than silently dropped — a client sending one is broken or hostile, and a
 * quiet fix would hide that. Pure, so both the athlete's own layout and the
 * coach's roster-wide layout validate through the same rule.
 */
export function validateLayout(
  favorites: unknown,
  range: unknown,
): InformationViewLayout | null {
  if (!Array.isArray(favorites) || favorites.length > PANEL_IDS.length) {
    return null;
  }
  const seen = new Set<string>();
  for (const id of favorites) {
    if (typeof id !== 'string' || !PANEL_IDS.includes(id) || seen.has(id)) {
      return null;
    }
    seen.add(id);
  }
  if (typeof range !== 'string' || !Object.hasOwn(RANGES, range)) {
    return null;
  }
  return { favorites: favorites as string[], range: range as RangeKey };
}

/** Persists an athlete's own Information View layout, once validated. */
export async function saveLayout(
  athleteId: string,
  favorites: unknown,
  range: unknown,
): Promise<SaveLayoutResult> {
  const layout = validateLayout(favorites, range);
  if (!layout) return { ok: false, reason: 'invalid-layout' };
  await updateInformationViewLayout(athleteId, layout);
  return { ok: true };
}
