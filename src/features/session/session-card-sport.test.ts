import { describe, it, expect } from 'vitest';
import { authorLabel, cardIcon, cardSport } from './session-card';
import { SESSION_SPORTS } from './session-sport';

describe('cardSport', () => {
  it('returns each of the seven sports for its own name', () => {
    for (const sport of SESSION_SPORTS) expect(cardSport({ sport })).toBe(sport);
  });

  it('returns the sport a Garmin label folds into, in any case', () => {
    expect(cardSport({ sport: 'Cycling' })).toBe('bike');
    expect(cardSport({ sport: 'open_water' })).toBe('swim');
    expect(cardSport({ sport: 'TRAIL_RUNNING' })).toBe('run');
    expect(cardSport({ sport: 'strength_training' })).toBe('strength');
  });

  it('returns null where the card shows Circle', () => {
    expect(cardSport({ sport: null })).toBeNull();
    expect(cardSport({ sport: '' })).toBeNull();
    expect(cardSport({ sport: 'kayaking' })).toBeNull();
    expect(cardSport({ sport: 'constructor' })).toBeNull();
    expect(cardSport({ sport: 'toString' })).toBeNull();
  });
});

describe('cardIcon', () => {
  it('shows Circle for an empty sport string', () => {
    expect(cardIcon({ sport: '' })).toBe('Circle');
  });

  it('names the icon of every Garmin label the card folds in', () => {
    const folded: Record<string, string> = {
      swimming: 'Waves', open_water: 'Waves', lap_swimming: 'Waves',
      cycling: 'Bike', biking: 'Bike', virtual_ride: 'Bike',
      running: 'Footprints', trail_running: 'Footprints', treadmill_running: 'Footprints',
      strength_training: 'Dumbbell',
    };
    for (const [sport, icon] of Object.entries(folded)) expect(cardIcon({ sport })).toBe(icon);
  });
});

describe('authorLabel', () => {
  it('trims the name it returns', () => {
    expect(authorLabel({ origin: 'athlete' }, { viewer: 'head_coach', athleteName: '  Mia ' })).toEqual({
      key: 'authorNamed',
      name: 'Mia',
    });
  });

  it('ignores the athlete’s name when the athlete is the viewer', () => {
    expect(authorLabel({ origin: 'athlete' }, { viewer: 'athlete', athleteName: 'Mia' })).toEqual({ key: 'authorYou' });
  });

  it('gives a Head Coach nothing for a session the athlete did not write', () => {
    for (const origin of ['coach', 'head_coach', 'arithmetic'] as const) {
      expect(authorLabel({ origin }, { viewer: 'head_coach', athleteName: 'Mia' })).toBeNull();
    }
  });
});
