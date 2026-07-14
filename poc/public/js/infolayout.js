// Information View layout store — Favorites membership and order.
//
// Pure operations (promote/demote/reorder) separated from storage, mirroring
// the calendar route's rules/store split. The layout is a per-user
// preference: what actually renders is gated by data availability (a
// favorited panel with no reading stays stored but does not display).
// Demote-only model: panels can never be hidden, only dropped from Favorites.

const KEY = 'bh_info_layout';

// Placeholder default until the expert's § 13 answers tune it.
export const DEFAULT_FAVORITES = ['ffnow', 'load', 'bodymind', 'sleep'];

// ── Pure operations ───────────────────────────────────────────────────────────
export function promote(favorites, id) {
  return favorites.includes(id) ? [...favorites] : [...favorites, id];
}

export function demote(favorites, id) {
  return favorites.filter(x => x !== id);
}

export function isFavorite(favorites, id) {
  return favorites.includes(id);
}

// Move `id` to the position currently held by `targetId` (issue 05).
export function reorder(favorites, id, targetId) {
  const from = favorites.indexOf(id), to = favorites.indexOf(targetId);
  if (from === -1 || to === -1 || id === targetId) return [...favorites];
  const next = [...favorites];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

// ── Storage ───────────────────────────────────────────────────────────────────
// validIds: known panel ids — unknown ids in a stored layout are ignored
// without error (forward compatibility across catalog changes).
export function loadFavorites(validIds) {
  let stored;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { stored = null; }
  if (!stored || !Array.isArray(stored.favorites)) return [...DEFAULT_FAVORITES];
  return stored.favorites.filter(id => validIds.includes(id));
}

export function saveFavorites(favorites) {
  localStorage.setItem(KEY, JSON.stringify({ favorites }));
}
