import { describe, it, expect, vi, beforeEach } from 'vitest';
import { athlete, coachingLink, sessions } from '../../src/db/schema';

/**
 * The retire script's shell (code-health/18): it must consult the production
 * guard before it reads anything, and it must find every coach's copy of the
 * personas — by label and ownerlessness, never by a fixed id.
 */
const guardDatabase = vi.fn();
vi.mock('../db-guard/protected-database', () => ({ guardDatabase }));

const whereArgs: unknown[] = [];
const found: { id: string; syntheticLabel: string; userId: string | null }[] = [];
// The athlete query returns what the fake database holds; every count query
// (sessions, links, leftovers) returns zero.
const selectShapes: Record<string, unknown>[] = [];
const fromTables: unknown[] = [];
const select = vi.fn((shape: Record<string, unknown>) => ({
  from: (table: unknown) => {
    selectShapes.push(shape);
    fromTables.push(table);
    return {
    where: (cond: unknown) => {
      whereArgs.push(cond);
      // The row query asks for id/label/user; every count query asks for `n`.
      const isCount = 'n' in shape;
      return Promise.resolve(!isCount && table === athlete ? [...found] : [{ n: 0 }]);
      },
    };
  },
}));
/** What the delete says it removed; one row per id by default. */
let erased: { id: string }[] = [];
const returningShapes: unknown[] = [];
const returning = vi.fn((shape: unknown) => {
  returningShapes.push(shape);
  return Promise.resolve(erased);
});
const del = vi.fn(() => ({ where: () => ({ returning }) }));
vi.mock('../../src/db', () => ({ getDb: () => ({ select, delete: del }) }));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, isNull: vi.fn(actual.isNull), inArray: vi.fn(actual.inArray) };
});
const { isNull, inArray } = await import('drizzle-orm');

const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

const { main } = await import('./retire-cli');

describe('retire-personas CLI', () => {
  beforeEach(() => {
    guardDatabase.mockClear();
    select.mockClear();
    vi.mocked(isNull).mockClear();
    vi.mocked(inArray).mockClear();
    whereArgs.length = 0;
    found.length = 0;
    erased = [];
    selectShapes.length = 0;
    fromTables.length = 0;
    returningShapes.length = 0;
    del.mockClear();
    exit.mockClear();
  });

  it('guards the database before reading it, and selects by label', async () => {
    await main([]);
    expect(guardDatabase).toHaveBeenCalledWith(process.env.DATABASE_URL, []);
    expect(guardDatabase.mock.invocationCallOrder[0]).toBeLessThan(select.mock.invocationCallOrder[0]);
    expect(vi.mocked(inArray)).toHaveBeenCalledWith(athlete.syntheticLabel, [
      'Alex Rivera',
      'Sam Chen',
      'Nadia Holm',
      'Test Athlete',
    ]);
    expect(del).not.toHaveBeenCalled();
  });

  it('reads owned rows too, so the refusal has something to refuse', async () => {
    // Filtering `user_id IS NULL` in the query would make `planRetirement`'s
    // refusal unreachable: the run would erase the rest and never say that a
    // labelled row belongs to somebody (review, 2026-09-22).
    await main([]);
    expect(vi.mocked(isNull)).not.toHaveBeenCalledWith(athlete.userId);
  });

  it('asks for what it prints: the row, then a count of each cascade', async () => {
    found.push({ id: 'id-1', syntheticLabel: 'Nadia Holm', userId: null });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main([]);
    expect(selectShapes[0]).toEqual({
      id: athlete.id,
      syntheticLabel: athlete.syntheticLabel,
      userId: athlete.userId,
    });
    expect(fromTables).toEqual([athlete, sessions, coachingLink]);
    expect(Object.keys(selectShapes[1])).toEqual(['n']);
    expect(Object.keys(selectShapes[2])).toEqual(['n']);
    log.mockRestore();
  });

  it('a dry run with copies found deletes nothing and says how many would go', async () => {
    found.push({ id: 'id-1', syntheticLabel: 'Nadia Holm', userId: null });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main([]);
    expect(del).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('dry run: 1 athlete row(s) would be erased. Re-run with --yes.');
    log.mockRestore();
  });

  it('refuses the whole run when a labelled row carries a user, and deletes nothing', async () => {
    found.push({ id: 'id-1', syntheticLabel: 'Nadia Holm', userId: 'u1' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['--yes']);
    expect(exit).toHaveBeenCalledWith(1);
    expect(del).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('REFUSE id-1 — has a user (u1); not a persona');
    log.mockRestore();
  });

  it('deletes only with --yes, and says what it removed', async () => {
    found.push({ id: 'id-1', syntheticLabel: 'Nadia Holm', userId: null });
    erased = [{ id: 'id-1' }];
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['--yes']);
    expect(del).toHaveBeenCalledWith(athlete);
    // The ids deleted are the ids planned, not whatever the rows happened to carry.
    expect(vi.mocked(inArray)).toHaveBeenCalledWith(athlete.id, ['id-1']);
    expect(returningShapes).toEqual([{ id: athlete.id }]);
    expect(log).toHaveBeenCalledWith('erased 1 athlete row(s); 0 of them remain.');
    expect(exit).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('stops with an error when a row slipped away between the plan and the delete', async () => {
    found.push({ id: 'id-1', syntheticLabel: 'Nadia Holm', userId: null });
    erased = [];
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await main(['--yes']);
    expect(error).toHaveBeenCalledWith('some rows gained a user between the plan and the delete; they were kept.');
    expect(exit).toHaveBeenCalledWith(1);
    log.mockRestore();
    error.mockRestore();
  });

  it('refuses an argument it does not know', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await main(['--force']);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('unknown argument: --force'));
    expect(exit).toHaveBeenCalledWith(1);
    error.mockRestore();
  });
});
