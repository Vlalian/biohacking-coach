import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AthleteRow } from '@/db/schema';

const limit = vi.fn();
const where = vi.fn(() => ({ limit }));
const selectArgs: unknown[] = [];

let updateCalls: unknown[] = [];
const updateWhere = vi.fn(() => Promise.resolve());
const set = vi.fn((v: unknown) => {
  updateCalls.push(v);
  return { where: updateWhere };
});

vi.mock('@/db', () => ({
  getDb: () => ({
    select: (projection?: unknown) => {
      selectArgs.push(projection);
      return { from: () => ({ where }) };
    },
    update: () => ({ set }),
  }),
}));

const {
  completeAthleteOnboarding,
  getAthleteByUserId,
  getAthleteSince,
  updateCommunicationStyle,
  updateExperienceLevel,
  updateHoursPerWeek,
  athleteProfileMerge,
} = await import('./athlete-repository');

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

describe('athleteProfileMerge (garmin-integration/03)', () => {
  beforeEach(() => {
    updateCalls = [];
    set.mockClear();
    updateWhere.mockClear();
  });

  it('builds the atomic profile merge as a statement, for a caller to batch', async () => {
    const { PgDialect } = await import('drizzle-orm/pg-core');
    const statement = athleteProfileMerge('athlete_1', { historyImportedAt: null });

    expect(set).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(1);
    expect(statement).toBeInstanceOf(Promise);
    const written = updateCalls[0] as { profile: import('drizzle-orm').SQL; updatedAt: Date };
    const { sql, params } = new PgDialect().sqlToQuery(written.profile);
    expect(sql).toContain('COALESCE("athlete"."profile", \'{}\'::jsonb) ||');
    expect(params).toEqual([JSON.stringify({ historyImportedAt: null })]);
    expect(written.updatedAt).toBeInstanceOf(Date);
  });
});

describe('getAthleteSince (training-architecture/13)', () => {
  beforeEach(() => {
    limit.mockReset();
    where.mockClear();
  });

  it('reads when the athlete arrived and when onboarding finished, scoped to the athlete', async () => {
    const createdAt = new Date('2026-05-01T09:00:00Z');
    limit.mockResolvedValue([{ createdAt, profile: { onboardedAt: '2026-06-01', fixedConstraints: [] } }]);

    selectArgs.length = 0;
    await expect(getAthleteSince('athlete_1')).resolves.toEqual({ createdAt, onboardedAt: '2026-06-01' });
    // Two columns, not the row: nothing about the athlete but when they arrived.
    expect(Object.keys(selectArgs[0] as object).sort()).toEqual(['createdAt', 'profile']);
    const { PgDialect } = await import('drizzle-orm/pg-core');
    const condition = (where.mock.calls[0] as unknown[])[0] as import('drizzle-orm').SQL;
    expect(new PgDialect().sqlToQuery(condition).params).toEqual(['athlete_1']);
  });

  it('has no onboarding date for a profile that never recorded one, and nothing for no athlete', async () => {
    const createdAt = new Date('2026-05-01T09:00:00Z');
    limit.mockResolvedValue([{ createdAt, profile: null }]);
    await expect(getAthleteSince('athlete_1')).resolves.toEqual({ createdAt, onboardedAt: undefined });

    limit.mockResolvedValue([]);
    await expect(getAthleteSince('nobody')).resolves.toBeNull();
  });
});

describe('completeAthleteOnboarding records the day it finished (training-architecture/13)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('merges onboardedAt, as today\'s date key, into the profile in the same write', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T10:00:00'));
    updateCalls = [];

    await completeAthleteOnboarding(
      'athlete_1',
      { experienceLevel: 'beginner', communicationStyle: 'x', raceTarget: null, raceDistance: 'Half', hoursPerWeek: 6 } as never,
      { weeklySessionDay: 'Monday' },
    );

    const { PgDialect } = await import('drizzle-orm/pg-core');
    const profile = (updateCalls[0] as { profile: import('drizzle-orm').SQL }).profile;
    const params = new PgDialect().sqlToQuery(profile).params;
    expect(params.map((p) => (typeof p === 'string' && p.startsWith('{') ? JSON.parse(p) : p))).toContainEqual({
      weeklySessionDay: 'Monday',
      onboardedAt: '2026-06-01',
    });
  });
});
