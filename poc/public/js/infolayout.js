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
// One layout object under one key; every save merges so favorites and the
// time range never clobber each other.
function readLayout() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return {}; }
}
function writeLayout(patch) {
  localStorage.setItem(KEY, JSON.stringify({ ...readLayout(), ...patch }));
}

// validIds: known panel ids — unknown ids in a stored layout are ignored
// without error (forward compatibility across catalog changes).
export function loadFavorites(validIds) {
  const stored = readLayout();
  if (!Array.isArray(stored.favorites)) return [...DEFAULT_FAVORITES];
  return stored.favorites.filter(id => validIds.includes(id));
}

export function saveFavorites(favorites) {
  writeLayout({ favorites });
}

// Time range: 'r4' | 'r12' | 'all' — a lasting preference like the layout.
export const RANGES = { r4: 4, r12: 12, all: null }; // → weeks for windowDataset

export function loadRange() {
  const stored = readLayout();
  return Object.hasOwn(RANGES, stored.range) ? stored.range : 'all';
}

export function saveRange(range) {
  if (!Object.hasOwn(RANGES, range)) return;
  writeLayout({ range });
}
