import { describe, it, expect } from 'vitest';
import type { Session } from './session';
import { cardIcon, cardLines, cardState } from './session-card';

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
    expect(cardState(s({ status: 'planned', origin: 'athlete' }))).toBe('accepted');
  });

  it('a completed arithmetic session is done, and a skipped one missed — the status wins over the origin', () => {
    expect(cardState(s({ status: 'completed', origin: 'arithmetic' }))).toBe('done');
    expect(cardState(s({ status: 'skipped', origin: 'arithmetic' }))).toBe('missed');
  });
});

describe('cardIcon', () => {
  it('picks the discipline icon when the sport is known, the Session Type icon otherwise', () => {
    expect(cardIcon(s({ sport: 'cycling', type: 'Endurance' }))).toBe('Bike');
    expect(cardIcon(s({ sport: null, type: 'Intensity' }))).toBe('Zap');
    expect(cardIcon(s({ sport: null, type: 'Unheard' }))).toBe('Circle');
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

  it('falls back to the Session Type for a sport it has no discipline for — a brick, strength, an unknown file label', () => {
    expect(cardIcon(s({ sport: 'brick', type: 'Endurance' }))).toBe('Activity');
    expect(cardIcon(s({ sport: 'strength_training', type: 'Strength' }))).toBe('Dumbbell');
    expect(cardIcon(s({ sport: 'constructor', type: 'toString' }))).toBe('Circle');
  });

  it('gives every Session Type its own icon', () => {
    const icons = ['Endurance', 'Intensity', 'Tempo', 'Recovery', 'Rest', 'Strength', 'Mobility'].map((type) =>
      cardIcon(s({ type })),
    );
    expect(icons).toEqual(['Activity', 'Zap', 'Gauge', 'Leaf', 'Moon', 'Dumbbell', 'StretchHorizontal']);
    expect(cardIcon(s({ type: 'Other' }))).toBe('Circle');
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
