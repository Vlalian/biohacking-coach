/**
 * Information View layout — Favorites membership/order and the time range.
 *
 * Pure operations (promote/demote/reorder) separated from storage, ported from
 * the POC's `infolayout.js`. Storage moved: the layout is a per-athlete
 * preference persisted in `athlete.information_view_layout` JSONB (ADR 0006 —
 * nothing durable is device-only), so what was a localStorage read is now
 * `parseLayout` over whatever the row holds.
 *
 * The layout is a preference; what actually renders is gated by data
 * availability (a favorited panel with no reading stays stored but does not
 * display). Demote-only model: panels can never be hidden, only dropped from
 * Favorites.
 */

/** Placeholder default until the expert's § 13 answers tune it. */
export const DEFAULT_FAVORITES = ['ffnow', 'load', 'bodymind', 'sleep'];

/** Time range the athlete thinks in → weeks for windowDataset. */
export const RANGES = { r4: 4, r12: 12, all: null } as const;
export type RangeKey = keyof typeof RANGES;

export type InformationViewLayout = {
  favorites: string[];
  range: RangeKey;
};

// ── Pure operations ──────────────────────────────────────────────────────────

export function promote(favorites: string[], id: string): string[] {
  return favorites.includes(id) ? [...favorites] : [...favorites, id];
}

export function demote(favorites: string[], id: string): string[] {
  return favorites.filter((x) => x !== id);
}

export function isFavorite(favorites: string[], id: string): boolean {
  return favorites.includes(id);
}

/** Move `id` to the position currently held by `targetId`. */
export function reorder(
  favorites: string[],
  id: string,
  targetId: string,
): string[] {
  const from = favorites.indexOf(id);
  const to = favorites.indexOf(targetId);
  if (from === -1 || to === -1 || id === targetId) return [...favorites];
  const next = [...favorites];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

// ── Parsing the stored layout ────────────────────────────────────────────────

function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === 'string' && Object.hasOwn(RANGES, value);
}

/**
 * Whatever the JSONB column holds becomes a valid layout here — the one place
 * stored preferences are trusted. A missing or malformed value falls back to
 * the defaults; unknown panel ids in a stored favorites list are dropped
 * without error (forward compatibility across catalog changes); an explicitly
 * emptied Favorites list stays empty — not reset to default.
 */
export function parseLayout(
  stored: unknown,
  validIds: string[],
): InformationViewLayout {
  const obj =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};

  const favorites = Array.isArray(obj.favorites)
    ? obj.favorites.filter(
        (id): id is string => typeof id === 'string' && validIds.includes(id),
      )
    : [...DEFAULT_FAVORITES];

  return { favorites, range: isRangeKey(obj.range) ? obj.range : 'all' };
}
