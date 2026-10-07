import { describe, it, expect } from 'vitest';
import { authorLabel, cardIcon, cardSport, cardState } from './session-card';
import { SESSION_SPORTS, isOptionalSessionSport, isSessionSport } from './session-sport';

const STATUSES = ['planned', 'completed', 'skipped', 'unavailable'] as const;
const ORIGINS = ['arithmetic', 'coach', 'head_coach', 'athlete', 'garmin'] as const;
const TYPES = ['Endurance', 'Intensity', 'Tempo', 'Recovery', 'Rest', 'Strength', 'Mobility', 'Other'];

describe('cardState over every status and origin', () => {
  it('lets completed be done and skipped or unavailable be missed for every origin', () => {
    for (const origin of ORIGINS) {
      expect(cardState({ status: 'completed', origin })).toBe('done');
      expect(cardState({ status: 'skipped', origin })).toBe('missed');
      expect(cardState({ status: 'unavailable', origin })).toBe('missed');
    }
  });

  it('names a planned session by its origin alone', () => {
    const expected = { arithmetic: 'arithmetic', coach: 'accepted', head_coach: 'accepted', athlete: 'athlete', garmin: 'accepted' };
    for (const origin of ORIGINS) expect(cardState({ status: 'planned', origin })).toBe(expected[origin]);
  });
});

describe('cardIcon over every sport and Session Type', () => {
  it('gives a sport the same icon whatever the Session Type, and the same one in any case', () => {
    for (const sport of SESSION_SPORTS) {
      const icon = cardIcon({ sport });
      expect(icon).not.toBe('Circle');
      for (const type of TYPES) expect(cardIcon({ sport, type })).toBe(icon);
      expect(cardIcon({ sport: sport.toUpperCase() })).toBe(icon);
    }
  });

  it('agrees with cardSport: a sport is named exactly when the icon is not Circle', () => {
    for (const sport of [...SESSION_SPORTS, 'cycling', 'kayaking', '', 'constructor', 'valueOf', null]) {
      expect(cardSport({ sport }) === null).toBe(cardIcon({ sport }) === 'Circle');
    }
  });
});

describe('authorLabel over every origin and viewer', () => {
  it('labels only an athlete’s own session, whoever looks', () => {
    for (const origin of ORIGINS) {
      for (const viewer of ['athlete', 'head_coach'] as const) {
        const label = authorLabel({ origin }, { viewer, athleteName: 'Mia' });
        expect(label === null).toBe(origin !== 'athlete');
      }
    }
  });

  it('treats any whitespace-only name as no name', () => {
    for (const name of ['', ' ', '\t', '\n ', '   \t  ']) {
      expect(authorLabel({ origin: 'athlete' }, { viewer: 'head_coach', athleteName: name })).toEqual({ key: 'authorAthlete' });
    }
  });
});

describe('the sport guards over odd values', () => {
  it('accept exactly the seven names, and the optional guard also undefined and null', () => {
    const values: unknown[] = [...SESSION_SPORTS, undefined, null, '', ' ', 'Run', 'runs', 0, 1, true, [], {}, ['run']];
    for (const value of values) {
      const isSeven = typeof value === 'string' && (SESSION_SPORTS as readonly string[]).indexOf(value) >= 0;
      expect(isSessionSport(value)).toBe(isSeven);
      expect(isOptionalSessionSport(value)).toBe(isSeven || value === undefined || value === null);
    }
  });
});
