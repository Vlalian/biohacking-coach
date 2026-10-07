import { describe, it, expect } from 'vitest';
import type { Session } from './session';
import { authorLabel, cardIcon, cardLines, cardState } from './session-card';
import { SESSION_SPORTS } from './session-sport';

/**
 * `showable-version/37` — a session on the Training Plan calendar is a card.
 * Pure: a session in, what the card shows out.
 */
const s = (over: Partial<Session> = {}): Session => ({
  id: 'sess_1',
  date: '2026-08-21',
  version: 1,
  type: 'Endurance',
  status: 'planned',
  parked: false,
  dayOrder: 0,
  title: 'Long ride',
  duration: null,
  zone: null,
  note: null,
  sport: null,
  feedbackBody: null,
  feedbackMind: null,
  feedbackComment: null,
  origin: 'coach',
  isTraining: true,
  summary: null,
  howTo: null,
  ...over,
});

describe('cardState', () => {
  it('names the state of a card', () => {
    expect(cardState(s({ status: 'completed' }))).toBe('done');
    expect(cardState(s({ status: 'skipped' }))).toBe('missed');
    expect(cardState(s({ status: 'unavailable', parked: true }))).toBe('missed');
    expect(cardState(s({ status: 'planned', origin: 'arithmetic' }))).toBe('arithmetic');
    expect(cardState(s({ status: 'planned', origin: 'coach' }))).toBe('accepted');
    expect(cardState(s({ status: 'planned', origin: 'head_coach' }))).toBe('accepted');
    expect(cardState(s({ status: 'planned', origin: 'athlete' }))).toBe('athlete');
  });

  it('names the athlete state for a planned athlete session, and lets done and missed win', () => {
    expect(cardState(s({ status: 'planned', origin: 'athlete' }))).toBe('athlete');
    expect(cardState(s({ status: 'completed', origin: 'athlete' }))).toBe('done');
    expect(cardState(s({ status: 'skipped', origin: 'athlete' }))).toBe('missed');
    expect(cardState(s({ status: 'unavailable', origin: 'athlete', parked: true }))).toBe('missed');
    expect(cardState(s({ status: 'planned', origin: 'coach' }))).toBe('accepted');
  });

  it('a completed arithmetic session is done, and a skipped one missed — the status wins over the origin', () => {
    expect(cardState(s({ status: 'completed', origin: 'arithmetic' }))).toBe('done');
    expect(cardState(s({ status: 'skipped', origin: 'arithmetic' }))).toBe('missed');
  });
});

describe('authorLabel', () => {
  it('names the author for the athlete and for the Head Coach, and for nobody else', () => {
    const own = { origin: 'athlete' as const };
    expect(authorLabel(own, { viewer: 'athlete', athleteName: null })).toEqual({ key: 'authorYou' });
    expect(authorLabel(own, { viewer: 'head_coach', athleteName: 'Mia' })).toEqual({ key: 'authorNamed', name: 'Mia' });
    expect(authorLabel(own, { viewer: 'head_coach', athleteName: null })).toEqual({ key: 'authorAthlete' });
    expect(authorLabel(own, { viewer: 'head_coach', athleteName: '  ' })).toEqual({ key: 'authorAthlete' });
    for (const origin of ['coach', 'head_coach', 'arithmetic', 'garmin'] as const) {
      expect(authorLabel({ origin }, { viewer: 'athlete', athleteName: 'Mia' })).toBeNull();
    }
  });
});

describe('cardIcon', () => {
  it('gives the seven sports seven distinct icons, and a Garmin label the sport it names', () => {
    const icons = SESSION_SPORTS.map((sport) => cardIcon(s({ sport })));
    expect(icons).toEqual(['Waves', 'Bike', 'Footprints', 'BrickWall', 'Dumbbell', 'StretchHorizontal', 'Shapes']);
    expect(new Set(icons).size).toBe(7);
    expect(cardIcon(s({ sport: 'brick' }))).not.toBe(cardIcon(s({ sport: 'bike' })));
    expect(cardIcon(s({ sport: 'Cycling' }))).toBe('Bike');
    expect(cardIcon(s({ sport: 'strength_training' }))).toBe('Dumbbell');
  });

  it('shows Circle without a known sport, whatever the Session Type, and ignores the type with one', () => {
    for (const type of ['Endurance', 'Intensity', 'Tempo', 'Recovery', 'Rest', 'Strength', 'Mobility', 'Other']) {
      expect(cardIcon(s({ sport: null, type }))).toBe('Circle');
      expect(cardIcon(s({ sport: 'kayaking', type }))).toBe('Circle');
      expect(cardIcon(s({ sport: 'constructor', type }))).toBe('Circle');
    }
    expect(cardIcon(s({ sport: 'run', type: 'Intensity' }))).toBe(cardIcon(s({ sport: 'run', type: 'Recovery' })));
  });

  it('reads the arithmetic’s short names and a Garmin import’s raw ones alike, in any case', () => {
    for (const sport of ['swim', 'swimming', 'open_water', 'lap_swimming', 'Swimming']) {
      expect(cardIcon(s({ sport }))).toBe('Waves');
    }
    for (const sport of ['bike', 'cycling', 'biking', 'virtual_ride']) expect(cardIcon(s({ sport }))).toBe('Bike');
    for (const sport of ['run', 'running', 'trail_running', 'treadmill_running', 'RUNNING']) {
      expect(cardIcon(s({ sport }))).toBe('Footprints');
    }
  });

});

describe('cardLines', () => {
  it('shows duration and zone when present and omits what is missing, never a placeholder', () => {
    expect(cardLines(s({ duration: 60, zone: 'Zone 2', note: 'Easy spin\nkeep cadence' }))).toEqual({
      title: 'Long ride',
      meta: ['60', 'Zone 2'],
      note: 'Easy spin',
    });
    expect(cardLines(s({ duration: null, zone: null, note: null }))).toMatchObject({ meta: [], note: null });
    expect(cardLines(s({ duration: null, zone: 'Z3' })).meta).toEqual(['Z3']);
    expect(cardLines(s({ duration: 45, zone: null })).meta).toEqual(['45']);
  });

  it('titles an untitled session by its Session Type', () => {
    expect(cardLines(s({ title: null, type: 'Tempo' })).title).toBe('Tempo');
  });

  it('treats a blank note, a blank first line and an empty zone as absent', () => {
    expect(cardLines(s({ note: '   ' })).note).toBeNull();
    expect(cardLines(s({ note: '\n  Second line  ' })).note).toBe('Second line');
    expect(cardLines(s({ note: '  First  \nsecond' })).note).toBe('First');
    expect(cardLines(s({ zone: '  ', duration: 0 })).meta).toEqual([]);
  });
});
