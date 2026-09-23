import { describe, it, expect } from 'vitest';
import { SESSION_ORIGINS, toSessionOrigin } from './session';

/**
 * `training-architecture/34` — the structure writes sessions of its own, and
 * an origin the code does not know silently becomes the Coach's.
 */
describe('session origins', () => {
  it('knows the arithmetic, and narrows it to itself rather than to the Coach', () => {
    expect(SESSION_ORIGINS).toContain('arithmetic');
    expect(toSessionOrigin('arithmetic')).toBe('arithmetic');
  });

  it('narrows every known origin to itself, and anything else to the Coach', () => {
    for (const origin of SESSION_ORIGINS) expect(toSessionOrigin(origin)).toBe(origin);
    expect(toSessionOrigin('nonsense')).toBe('coach');
    expect(toSessionOrigin('')).toBe('coach');
  });
});
