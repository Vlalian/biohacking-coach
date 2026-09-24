import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AthleteRow } from '@/db/schema';

const limit = vi.fn();
const where = vi.fn(() => ({ limit }));

let updateCalls: unknown[] = [];
const updateWhere = vi.fn(() => Promise.resolve());
const set = vi.fn((v: unknown) => {
  updateCalls.push(v);
  return { where: updateWhere };
});

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where }) }),
    update: () => ({ set }),
  }),
}));

const { getAthleteByUserId, updateCommunicationStyle, updateExperienceLevel, updateHoursPerWeek } = await import(
  './athlete-repository'
);

function row(overrides: Partial<AthleteRow> = {}): AthleteRow {
  return {
    id: 'eff4e0bc-d603-4d5e-8ae5-369ff5bb1213',
    userId: 'user_abc',
    syntheticLabel: null,
    experienceLevel: null,
    communicationStyle: null,
    raceTarget: null,
    raceDistance: null,
    hoursPerWeek: null,
    trainingSessionsPerWeek: null,
    profile: null,
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
      experienceLevel: null,
      communicationStyle: null,
      raceTarget: null,
      raceDistance: null,
      hoursPerWeek: null,
    trainingSessionsPerWeek: null,
      profile: null,
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
        'experienceLevel',
        'hoursPerWeek',
        'id',
        'profile',
        'raceDistance',
        'raceTarget',
        'syntheticLabel',
        'trainingSessionsPerWeek',
      ].sort(),
    );
    // The user identity anchor is stripped at this boundary (ADR 0006).
    expect(athlete).not.toHaveProperty('userId');
  });
});

describe('updateCommunicationStyle', () => {
  beforeEach(() => {
    updateCalls = [];
    set.mockClear();
    updateWhere.mockClear();
  });

  it('writes the given value to the communication_style column', async () => {
    await updateCommunicationStyle('athlete_1', 'Terse, technical, no hand-holding.');

    expect(updateCalls).toHaveLength(1);
    const written = updateCalls[0] as { communicationStyle: string; updatedAt: Date };
    expect(written.communicationStyle).toBe('Terse, technical, no hand-holding.');
    expect(written.updatedAt).toBeInstanceOf(Date);
  });
});

describe('updateExperienceLevel (training-architecture/35)', () => {
  beforeEach(() => {
    updateCalls = [];
    set.mockClear();
    updateWhere.mockClear();
  });

  it('writes the derived level to the athlete row, scoped by id', async () => {
    await updateExperienceLevel('athlete_1', 'veteran');
    expect(set).toHaveBeenCalledTimes(1);
    expect(updateCalls[0]).toMatchObject({ experienceLevel: 'veteran' });
    expect((updateCalls[0] as { updatedAt: Date }).updatedAt).toBeInstanceOf(Date);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });
});

describe('updateHoursPerWeek (showable-version/40)', () => {
  beforeEach(() => {
    updateCalls = [];
    set.mockClear();
    updateWhere.mockClear();
  });

  it('writes the hours to the athlete row, scoped by id', async () => {
    await updateHoursPerWeek('athlete_1', 10);
    expect(set).toHaveBeenCalledTimes(1);
    expect(updateCalls[0]).toMatchObject({ hoursPerWeek: 10 });
    expect((updateCalls[0] as { updatedAt: Date }).updatedAt).toBeInstanceOf(Date);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });
});
