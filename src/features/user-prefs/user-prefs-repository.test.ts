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

const { getUiPrefs, setUiLanguage, setPreferredName, setWeekCycleInstructed, getPreferredNameForAthlete, getLanguageForAthlete } = await import(
  './user-prefs-repository',
);


/**
 * A drizzle `sql` expression, taken apart: the literal text with its columns
 * inlined, and the bound parameters. The setters merge inside Postgres now, so
 * what is asserted is the expression handed to `set`, not an object built in
 * JavaScript (CodeRabbit, PR #102).
 */
function sqlParts(expr: unknown): { text: string; values: unknown[] } {
  const chunks = (expr as { queryChunks?: unknown[] }).queryChunks ?? [];
  let text = '';
  const values: unknown[] = [];
  for (const chunk of chunks) {
    const node = chunk as { value?: unknown; name?: unknown };
    if (Array.isArray(node.value)) text += node.value.join('');
    else if (typeof node.name === 'string') text += node.name;
    else values.push(node.value);
  }
  return { text, values };
}

const MERGE = "coalesce(ui_prefs, '{}'::jsonb) || ::jsonb";
const REMOVE = "coalesce(ui_prefs, '{}'::jsonb) - ";

/** The expression `set` was handed for `uiPrefs`. */
function written(): { text: string; values: unknown[] } {
  return sqlParts((updatedSet as { uiPrefs: unknown }).uiPrefs);
}

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
    await setUiLanguage('user_abc', 'da');
    expect(update).toHaveBeenCalledWith(user);
    expect(eq).toHaveBeenCalledWith(user.id, 'user_abc');
    expect(written().values).toEqual(['{"language":"da"}']);
  });

  it('merges inside the database, so a preference written at the same moment survives', async () => {
    // Read-modify-write in JavaScript lost whichever write finished second:
    // two settings pages open, or a coach dismissing the week cycle while a
    // language change was in flight, and one of them vanished.
    await setUiLanguage('user_abc', 'da');
    expect(written().text).toBe(MERGE);
    expect(select).not.toHaveBeenCalled();
  });
});

describe('setPreferredName', () => {
  it('stores the chosen name on the user row, merging over other prefs', async () => {
    await setPreferredName('user_abc', 'Mads');
    expect(update).toHaveBeenCalledWith(user);
    expect(eq).toHaveBeenCalledWith(user.id, 'user_abc');
    expect(written()).toEqual({ text: MERGE, values: ['{"preferredName":"Mads"}'] });
    expect(select).not.toHaveBeenCalled();
  });

  it('removes the key entirely when cleared, rather than storing null or ""', async () => {
    await setPreferredName('user_abc', null);
    expect(written()).toEqual({ text: REMOVE, values: ['preferredName'] });
    expect(select).not.toHaveBeenCalled();
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

describe('getLanguageForAthlete (showable-version/46)', () => {
  it("reads the Athlete Language through the user seam, keyed by the opaque athlete id", async () => {
    selectRows = [{ uiPrefs: { language: 'da', preferredName: 'Mads' } }];
    expect(await getLanguageForAthlete('athlete_1')).toBe('da');
    expect(select).toHaveBeenCalledWith({ uiPrefs: user.uiPrefs });
    expect(innerJoin).toHaveBeenCalledWith(user, expect.anything());
    expect(eq).toHaveBeenCalledWith(athlete.id, 'athlete_1');
  });

  it('is null for an athlete who set none, for empty prefs, and for one with no user at all', async () => {
    selectRows = [{ uiPrefs: { preferredName: 'Mads' } }];
    expect(await getLanguageForAthlete('athlete_1')).toBeNull();
    selectRows = [{ uiPrefs: null }];
    expect(await getLanguageForAthlete('athlete_1')).toBeNull();
    selectRows = [];
    expect(await getLanguageForAthlete('synthetic_1')).toBeNull();
  });
});

describe('setWeekCycleInstructed', () => {
  it('records that this coach has been shown the week cycle, keeping their other prefs', async () => {
    await setWeekCycleInstructed('user-1');
    expect(written()).toEqual({ text: MERGE, values: ['{"weekCycleInstructed":true}'] });
    expect(vi.mocked(eq)).toHaveBeenCalledWith(user.id, 'user-1');
    expect(select).not.toHaveBeenCalled();
  });
});
