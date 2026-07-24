import { updateInformationViewLayout } from '@/features/athlete/athlete-repository';
import { RANGES, type InformationViewLayout, type RangeKey } from './layout';
import { PANEL_IDS } from './panels';

export type SaveLayoutResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-layout' };

/**
 * Persists an athlete's Information View layout — favorites membership/order
 * and the time range — after deciding it is one the catalog recognises.
 *
 * The client proposes, the server disposes (ADR 0006): whatever arrived in the
 * request is untrusted until every favorite is a known panel id (deduplicated,
 * order kept) and the range is a known key. An unknown id is refused rather
 * than silently dropped — a client sending one is broken or hostile, and a
 * quiet fix would hide that.
 */
export async function saveLayout(
  athleteId: string,
  favorites: unknown,
  range: unknown,
): Promise<SaveLayoutResult> {
  if (!Array.isArray(favorites) || favorites.length > PANEL_IDS.length) {
    return { ok: false, reason: 'invalid-layout' };
  }
  const seen = new Set<string>();
  for (const id of favorites) {
    if (typeof id !== 'string' || !PANEL_IDS.includes(id) || seen.has(id)) {
      return { ok: false, reason: 'invalid-layout' };
    }
    seen.add(id);
  }
  if (typeof range !== 'string' || !Object.hasOwn(RANGES, range)) {
    return { ok: false, reason: 'invalid-layout' };
  }

  const layout: InformationViewLayout = {
    favorites: favorites as string[],
    range: range as RangeKey,
  };
  await updateInformationViewLayout(athleteId, layout);
  return { ok: true };
}
