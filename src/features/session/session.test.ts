import { describe, it, expect } from 'vitest';
import { SESSION_ORIGINS, isImportedHistory, toDeviceSummary, toSessionOrigin } from './session';

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

/** `garmin-integration/07` — the drawer shows what the device recorded. */
describe('device summary', () => {
  it('keeps the distance and heart rate a device recorded', () => {
    expect(toDeviceSummary({ distanceM: 42000, avgHr: 138, maxHr: 170 })).toEqual({
      distanceM: 42000,
      avgHr: 138,
    });
  });

  it('keeps one fact without the other', () => {
    expect(toDeviceSummary({ distanceM: null, avgHr: 150 })).toEqual({ distanceM: null, avgHr: 150 });
    expect(toDeviceSummary({ distanceM: 1500 })).toEqual({ distanceM: 1500, avgHr: null });
  });

  it('reads no summary from nothing, a non-object, or an object without either fact', () => {
    expect(toDeviceSummary(null)).toBeNull();
    expect(toDeviceSummary(undefined)).toBeNull();
    expect(toDeviceSummary('42000')).toBeNull();
    expect(toDeviceSummary({ distanceM: '42000', avgHr: Number.NaN })).toBeNull();
    expect(toDeviceSummary({})).toBeNull();
  });
});

describe('imported history', () => {
  it('is a completed session a History Upload wrote', () => {
    expect(isImportedHistory({ origin: 'garmin', status: 'completed' })).toBe(true);
  });

  it('is not an in-app session, nor a garmin row that is not completed', () => {
    expect(isImportedHistory({ origin: 'coach', status: 'completed' })).toBe(false);
    expect(isImportedHistory({ origin: 'athlete', status: 'completed' })).toBe(false);
    expect(isImportedHistory({ origin: 'garmin', status: 'planned' })).toBe(false);
  });
});
