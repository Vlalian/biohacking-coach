import { describe, it, expect } from 'vitest';
import type { SessionRow } from '@/db/schema';
import { SESSION_ORIGINS, isImportedHistory, isUnrecorded, toDeviceSummary, toSession, toSessionOrigin } from './session';

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

/** `training-architecture/45` — a past Planned Session nobody ticked. */
describe('unrecorded', () => {
  it("names a past planned session unrecorded, and today's not", () => {
    expect(isUnrecorded({ status: 'planned', date: '2026-09-28' }, '2026-09-29')).toBe(true);
    expect(isUnrecorded({ status: 'planned', date: '2026-09-29' }, '2026-09-29')).toBe(false);
  });

  it('is never a session that was completed, skipped or made unavailable', () => {
    for (const status of ['completed', 'skipped', 'unavailable']) {
      expect(isUnrecorded({ status, date: '2026-09-20' }, '2026-09-29')).toBe(false);
    }
  });
});

/** `training-architecture/26` — what was written about how to do a session reaches the read model, parsed. */
describe('toSession — the how-to column', () => {
  const row = (howTo: unknown): SessionRow =>
    ({
      id: 's1',
      athleteId: 'a1',
      date: '2026-10-05',
      type: 'Endurance',
      origin: 'coach',
      status: 'planned',
      parked: false,
      parkedByDate: null,
      isTraining: true,
      duration: 60,
      zone: 'Z2',
      note: null,
      title: null,
      dayOrder: 0,
      startTime: null,
      sport: 'bike',
      summary: null,
      externalId: null,
      howTo,
      feedbackBody: null,
      feedbackMind: null,
      feedbackComment: null,
      ratedAt: null,
      version: 1,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }) as SessionRow;

  it('carries Momentum’s cue from the stored column', () => {
    expect(toSession(row({ cue: 'Spin light, spare the knee.' })).howTo).toEqual({ cue: 'Spin light, spare the knee.' });
  });

  it('reads an empty or malformed column as nothing written', () => {
    expect(toSession(row(null)).howTo).toBeNull();
    expect(toSession(row({ cue: 42 })).howTo).toBeNull();
  });
});
