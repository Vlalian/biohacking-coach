import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AthleteRow } from '@/db/schema';

const limit = vi.fn();

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ limit }) }),
  }),
}));

const { getCurrentAthlete } = await import('./athlete-repository');

function row(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: 'eff4e0bc-d603-4d5e-8ae5-369ff5bb1213',
    userId: null,
    displayName: 'Mads',
    phase: null,
    experienceLevel: null,
    commStyle: null,
    raceTarget: null,
    weeklySessionCount: null,
    profile: null,
    equipment: null,
    infoLayout: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('getCurrentAthlete', () => {
  beforeEach(() => {
    limit.mockReset();
  });

  it('returns the athlete when one exists', async () => {
    limit.mockResolvedValue([row()]);

    const athlete = await getCurrentAthlete();

    expect(athlete).toEqual({
      id: 'eff4e0bc-d603-4d5e-8ae5-369ff5bb1213',
      displayName: 'Mads',
    });
  });

  it('returns undefined on an unseeded database rather than throwing', async () => {
    // The page renders a "has the seed run?" message off this. If the seam
    // threw instead, an empty database would be a 500 rather than a hint.
    limit.mockResolvedValue([]);

    await expect(getCurrentAthlete()).resolves.toBeUndefined();
  });

  it('exposes only the domain shape, never the stored row', async () => {
    // ADR 0006 keeps identity out of training data, and the guidelines keep
    // storage types out of the app. Both hold only while this boundary
    // converts — if the raw row leaks through, every component starts
    // depending on the column layout and slice 02 stops being a one-file
    // change. That claim is in this module's docstring, so it is tested.
    limit.mockResolvedValue([row({ profile: { secret: 'onboarding answers' } })]);

    const athlete = await getCurrentAthlete();

    expect(Object.keys(athlete!).sort()).toEqual(['displayName', 'id']);
  });

  it('is an athlete even with no login — synthetic athletes have no user', async () => {
    // Route ticket 05, ballot 1: roles are rows you have. A null userId is the
    // mechanism for synthetic athletes, not a broken record to filter out.
    limit.mockResolvedValue([row({ userId: null, displayName: 'Synthetic A' })]);

    await expect(getCurrentAthlete()).resolves.toMatchObject({
      displayName: 'Synthetic A',
    });
  });
});
