import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FAVORITES,
  RANGES,
  promote,
  demote,
  reorder,
  isFavorite,
  parseLayout,
} from './layout';

const VALID = ['ffnow', 'load', 'bodymind', 'sleep', 'race', 'hours'];

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
    promote(favs, 'c');
    demote(favs, 'a');
    reorder(favs, 'b', 'a');
    expect(favs).toEqual(['a', 'b']);
  });
  it('isFavorite', () => {
    expect(isFavorite(['a'], 'a')).toBe(true);
    expect(isFavorite(['a'], 'b')).toBe(false);
  });
});

describe('parseLayout — the stored JSONB becomes a valid layout', () => {
  it('a never-saved layout yields the default Favorites set and all history', () => {
    expect(parseLayout(null, VALID)).toEqual({
      favorites: DEFAULT_FAVORITES,
      range: 'all',
    });
    expect(RANGES.all).toBeNull();
  });

  it('a saved layout round-trips membership and order', () => {
    const parsed = parseLayout({ favorites: ['sleep', 'ffnow', 'race'], range: 'r4' }, VALID);
    expect(parsed.favorites).toEqual(['sleep', 'ffnow', 'race']);
    expect(parsed.range).toBe('r4');
    expect(RANGES.r4).toBe(4);
  });

  it('unknown panel ids in a stored layout are ignored without error', () => {
    expect(
      parseLayout({ favorites: ['sleep', 'retired-panel', 'ffnow'] }, VALID).favorites,
    ).toEqual(['sleep', 'ffnow']);
  });

  const corrupt: Array<[string, unknown]> = [
    ['a string', 'not an object'],
    ['an array', ['sleep']],
    ['a number', 7],
    ['favorites of the wrong type', { favorites: 'sleep' }],
    ['non-string members', { favorites: [1, null, 'sleep'] }],
  ];
  for (const [name, stored] of corrupt) {
    it(`corrupt storage (${name}) falls back without error`, () => {
      const parsed = parseLayout(stored, VALID);
      for (const id of parsed.favorites) expect(VALID).toContain(id);
      expect(parsed.range).toBe('all');
    });
  }

  it('an emptied Favorites list stays empty — not reset to default', () => {
    expect(parseLayout({ favorites: [] }, VALID).favorites).toEqual([]);
  });

  it('unknown stored ranges fall back to all', () => {
    expect(parseLayout({ range: 'r99' }, VALID).range).toBe('all');
  });

  it('favorites and range are independent — one being set never clobbers the other', () => {
    expect(parseLayout({ range: 'r12' }, VALID)).toEqual({
      favorites: DEFAULT_FAVORITES,
      range: 'r12',
    });
    expect(parseLayout({ favorites: ['sleep'] }, VALID)).toEqual({
      favorites: ['sleep'],
      range: 'all',
    });
  });
});
