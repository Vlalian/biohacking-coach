import { describe, it, expect } from 'vitest';
import { SESSION_SPORTS, isSessionSport } from './session-sport';

describe('SESSION_SPORTS', () => {
  it('holds the seven sports in order and the guard accepts only those', () => {
    expect([...SESSION_SPORTS]).toEqual(['swim', 'bike', 'run', 'brick', 'strength', 'mobility', 'misc']);
    for (const sport of SESSION_SPORTS) expect(isSessionSport(sport)).toBe(true);
    for (const other of ['cycling', 'Swim', '', 'constructor', null, undefined, 7]) {
      expect(isSessionSport(other)).toBe(false);
    }
  });
});
