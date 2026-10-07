import { describe, it, expect } from 'vitest';
import { SESSION_SPORTS, isOptionalSessionSport, isSessionSport } from './session-sport';

describe('isSessionSport', () => {
  it('rejects a seven-sport name with a stray space or a different case', () => {
    for (const sport of SESSION_SPORTS) {
      expect(isSessionSport(` ${sport}`)).toBe(false);
      expect(isSessionSport(`${sport} `)).toBe(false);
      expect(isSessionSport(sport.toUpperCase())).toBe(false);
    }
  });

  it('rejects a non-string, even one that prints as a sport', () => {
    expect(isSessionSport(['swim'])).toBe(false);
    expect(isSessionSport({ toString: () => 'swim' })).toBe(false);
  });
});

describe('isOptionalSessionSport', () => {
  it('accepts undefined, null and each of the seven sports', () => {
    expect(isOptionalSessionSport(undefined)).toBe(true);
    expect(isOptionalSessionSport(null)).toBe(true);
    for (const sport of SESSION_SPORTS) expect(isOptionalSessionSport(sport)).toBe(true);
  });

  it('rejects anything else, the empty string and zero included', () => {
    for (const other of ['', 'cycling', 'Swim', 'constructor', 0, false, 7, [], {}]) {
      expect(isOptionalSessionSport(other)).toBe(false);
    }
  });
});
