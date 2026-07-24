import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AthleteRow } from '@/db/schema';

const limit = vi.fn();
const where = vi.fn(() => ({ limit }));

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where }) }),
  }),
}));

const { getAthleteByUserId } = await import('./athlete-repository');

function row(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: 'eff4e0bc-d603-4d5e-8ae5-369ff5bb1213',
    userId: 'user_abc',
    syntheticLabel: null,
    trainingPhase: null,
    experienceLevel: null,
    communicationStyle: null,
    raceTarget: null,
    trainingSessionsPerWeek: null,
    profile: null,
    equipment: null,
    informationViewLayout: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('getAthleteByUserId', () => {
  beforeEach(() => {
    limit.mockReset();
    where.mockClear();
  });

  it('resolves the athlete a user owns', async () => {
    limit.mockResolvedValue([row()]);

    const athlete = await getAthleteByUserId('user_abc');

    expect(athlete).toEqual({
      id: 'eff4e0bc-d603-4d5e-8ae5-369ff5bb1213',
      syntheticLabel: null,
      trainingPhase: null,
      experienceLevel: null,
      communicationStyle: null,
      raceTarget: null,
      trainingSessionsPerWeek: null,
      profile: null,
      equipment: null,
    });
  });

  it('returns undefined when the user has no athlete rather than throwing', async () => {
    // The page treats this as "signed in but unprovisioned" and shows a hint. If
    // the seam threw instead, that state would be a 500.
    limit.mockResolvedValue([]);

    await expect(getAthleteByUserId('user_nobody')).resolves.toBeUndefined();
  });

  it('exposes only the domain shape, never the stored row', async () => {
    // ADR 0006 keeps identity out of training data, and the guidelines keep
    // storage types out of the app. Both hold only while this boundary
    // converts — if the raw row leaked through, every component would start
    // depending on the column layout. That claim is in the module's docstring,
    // so it is tested. The identity anchors (userId) and storage-only columns
    // (informationViewLayout, createdAt, updatedAt) must never appear.
    limit.mockResolvedValue([row({ userId: 'user_abc' })]);

    const athlete = await getAthleteByUserId('user_abc');

    expect(Object.keys(athlete!).sort()).toEqual(
      [
        'communicationStyle',
        'equipment',
        'experienceLevel',
        'id',
        'profile',
        'raceTarget',
        'syntheticLabel',
        'trainingPhase',
        'trainingSessionsPerWeek',
      ].sort(),
    );
    // The user identity anchor is stripped at this boundary (ADR 0006).
    expect(athlete).not.toHaveProperty('userId');
  });
});
