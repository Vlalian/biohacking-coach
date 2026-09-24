import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { athlete } from '@/db/schema';
// Spy eq so the userId scoping can be asserted; fake the builder chain so the
// merge-over-existing-prefs behaviour is observable.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, eq: vi.fn(actual.eq) };
});

let selectRows: unknown[] = [];
let updatedSet: unknown = null;

const limit = vi.fn(() => Promise.resolve(selectRows));
const where = vi.fn(() => ({ limit }));
const innerJoin = vi.fn(() => ({ where }));
const from = vi.fn(() => ({ where, innerJoin }));
const select = vi.fn(() => ({ from }));

const updateWhere = vi.fn(() => Promise.resolve());
const set = vi.fn((v: unknown) => {
  updatedSet = v;
  return { where: updateWhere };
});
const update = vi.fn(() => ({ set }));

vi.mock('@/db', () => ({ getDb: () => ({ select, update }) }));

const { getUiPrefs, setUiLanguage, setPreferredName, setWeekCycleInstructed, getPreferredNameForAthlete } = await import(
  './user-prefs-repository',
);

beforeEach(() => {
  selectRows = [];
  updatedSet = null;
  vi.clearAllMocks();
});

describe('getUiPrefs', () => {
  it('reads the prefs for exactly this user', async () => {
    selectRows = [{ uiPrefs: { language: 'da' } }];
    const prefs = await getUiPrefs('user_abc');
    expect(eq).toHaveBeenCalledWith(user.id, 'user_abc');
    expect(select).toHaveBeenCalledWith({ uiPrefs: user.uiPrefs });
    expect(prefs).toEqual({ language: 'da' });
  });

  it('is empty (not null) for a user who never chose anything', async () => {
    selectRows = [{ uiPrefs: null }];
    expect(await getUiPrefs('user_abc')).toEqual({});
  });
});

describe('setUiLanguage', () => {
  it('stores the chosen language on the user row', async () => {
    selectRows = [{ uiPrefs: null }];
    await setUiLanguage('user_abc', 'da');
    expect(update).toHaveBeenCalledWith(user);
    expect(updatedSet).toEqual({ uiPrefs: { language: 'da' } });
  });

  it('merges over other stored prefs instead of clobbering them', async () => {
    selectRows = [{ uiPrefs: { language: 'en', theme: 'dark' } }];
    await setUiLanguage('user_abc', 'da');
    expect(updatedSet).toEqual({ uiPrefs: { language: 'da', theme: 'dark' } });
  });
});

describe('setPreferredName', () => {
  it('stores the chosen name on the user row, merging over other prefs', async () => {
    selectRows = [{ uiPrefs: { language: 'da' } }];
    await setPreferredName('user_abc', 'Mads');
    expect(update).toHaveBeenCalledWith(user);
    expect(eq).toHaveBeenCalledWith(user.id, 'user_abc');
    expect(updatedSet).toEqual({ uiPrefs: { language: 'da', preferredName: 'Mads' } });
  });

  it('removes the key entirely when cleared, rather than storing null or ""', async () => {
    selectRows = [{ uiPrefs: { language: 'da', preferredName: 'Mads' } }];
    await setPreferredName('user_abc', null);
    expect(updatedSet).toEqual({ uiPrefs: { language: 'da' } });
  });
});

describe('getPreferredNameForAthlete', () => {
  it('reads the name through the user seam, keyed by the opaque athlete id', async () => {
    selectRows = [{ uiPrefs: { preferredName: 'Mads' } }];
    expect(await getPreferredNameForAthlete('athlete_1')).toBe('Mads');
    expect(select).toHaveBeenCalledWith({ uiPrefs: user.uiPrefs });
    expect(innerJoin).toHaveBeenCalledWith(user, expect.anything());
    expect(eq).toHaveBeenCalledWith(athlete.id, 'athlete_1');
  });

  it('is null for an athlete who set none, and for one with no user at all', async () => {
    selectRows = [{ uiPrefs: { language: 'en' } }];
    expect(await getPreferredNameForAthlete('athlete_1')).toBeNull();
    selectRows = [];
    expect(await getPreferredNameForAthlete('synthetic_1')).toBeNull();
  });
});

describe('setWeekCycleInstructed', () => {
  it('records that this coach has been shown the week cycle, keeping their other prefs', async () => {
    selectRows = [{ uiPrefs: { language: 'da', preferredName: 'Sarah' } }];
    await setWeekCycleInstructed('user-1');
    expect(updatedSet).toEqual({
      uiPrefs: { language: 'da', preferredName: 'Sarah', weekCycleInstructed: true },
    });
    expect(vi.mocked(eq)).toHaveBeenCalledWith(user.id, 'user-1');
  });

  it('writes the flag for a user who had no prefs at all', async () => {
    selectRows = [];
    await setWeekCycleInstructed('user-2');
    expect(updatedSet).toEqual({ uiPrefs: { weekCycleInstructed: true } });
  });
});
