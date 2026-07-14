// @vitest-environment jsdom
// Layout store — pure Favorites operations + localStorage round-trip.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_FAVORITES, promote, demote, reorder, isFavorite,
  loadFavorites, saveFavorites,
} from '../public/js/infolayout.js';

const VALID = ['ffnow', 'load', 'bodymind', 'sleep', 'race', 'hours'];

beforeEach(() => localStorage.clear());

describe('pure operations', () => {
  it('promote appends once, idempotently', () => {
    expect(promote(['a'], 'b')).toEqual(['a', 'b']);
    expect(promote(['a', 'b'], 'b')).toEqual(['a', 'b']);
  });
  it('demote removes without touching others', () => {
    expect(demote(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    expect(demote(['a'], 'x')).toEqual(['a']);
  });
  it('reorder moves id to the target position', () => {
    expect(reorder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(reorder(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  });
  it('reorder is a no-op for unknown ids or self-drops', () => {
    expect(reorder(['a', 'b'], 'x', 'a')).toEqual(['a', 'b']);
    expect(reorder(['a', 'b'], 'a', 'x')).toEqual(['a', 'b']);
    expect(reorder(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
  });
  it('operations return new arrays — no mutation', () => {
    const favs = ['a', 'b'];
    promote(favs, 'c'); demote(favs, 'a'); reorder(favs, 'b', 'a');
    expect(favs).toEqual(['a', 'b']);
  });
  it('isFavorite', () => {
    expect(isFavorite(['a'], 'a')).toBe(true);
    expect(isFavorite(['a'], 'b')).toBe(false);
  });
});

describe('storage round-trip', () => {
  it('first run yields the default Favorites set', () => {
    expect(loadFavorites(DEFAULT_FAVORITES)).toEqual(DEFAULT_FAVORITES);
  });
  it('save then load preserves membership and order', () => {
    saveFavorites(['sleep', 'ffnow', 'race']);
    expect(loadFavorites(VALID)).toEqual(['sleep', 'ffnow', 'race']);
  });
  it('unknown panel ids in a stored layout are ignored without error', () => {
    saveFavorites(['sleep', 'retired-panel', 'ffnow']);
    expect(loadFavorites(VALID)).toEqual(['sleep', 'ffnow']);
  });
  it('corrupt storage falls back to the default set', () => {
    localStorage.setItem('bh_info_layout', '{not json');
    expect(loadFavorites(VALID)).toEqual(DEFAULT_FAVORITES);
  });
  it('an emptied Favorites list stays empty — not reset to default', () => {
    saveFavorites([]);
    expect(loadFavorites(VALID)).toEqual([]);
  });
});
