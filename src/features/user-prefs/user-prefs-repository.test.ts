import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { user } from '@/db/auth-schema';

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
const from = vi.fn(() => ({ where }));
const select = vi.fn(() => ({ from }));

const updateWhere = vi.fn(() => Promise.resolve());
const set = vi.fn((v: unknown) => {
  updatedSet = v;
  return { where: updateWhere };
});
const update = vi.fn(() => ({ set }));

vi.mock('@/db', () => ({ getDb: () => ({ select, update }) }));

const { getUiPrefs, setUiLanguage } = await import('./user-prefs-repository');

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
