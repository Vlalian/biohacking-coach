import { describe, it, expect, vi, beforeEach } from 'vitest';
import { athlete } from '../../src/db/schema';

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
const select = vi.fn(() => ({
  from: (table: unknown) => ({
    where: (cond: unknown) => {
      whereArgs.push(cond);
      return Promise.resolve(table === athlete ? [...found] : [{ n: 0 }]);
    },
  }),
}));
const returning = vi.fn(() => Promise.resolve([]));
const del = vi.fn(() => ({ where: () => ({ returning }) }));
vi.mock('../../src/db', () => ({ getDb: () => ({ select, delete: del }) }));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, isNull: vi.fn(actual.isNull), inArray: vi.fn(actual.inArray) };
});
const { isNull, inArray } = await import('drizzle-orm');

const { main } = await import('./retire-cli');

describe('retire-personas CLI', () => {
  beforeEach(() => {
    guardDatabase.mockClear();
    select.mockClear();
    vi.mocked(isNull).mockClear();
    vi.mocked(inArray).mockClear();
    whereArgs.length = 0;
    found.length = 0;
  });

  it('guards the database before reading it, and selects unowned rows by label', async () => {
    await main([]);
    expect(guardDatabase).toHaveBeenCalledWith(process.env.DATABASE_URL, []);
    expect(guardDatabase.mock.invocationCallOrder[0]).toBeLessThan(select.mock.invocationCallOrder[0]);
    expect(isNull).toHaveBeenCalledWith(athlete.userId);
    expect(inArray).toHaveBeenCalledWith(athlete.syntheticLabel, ['Alex Rivera', 'Sam Chen', 'Nadia Holm', 'Test Athlete']);
    expect(del).not.toHaveBeenCalled();
  });

  it('a dry run with copies found deletes nothing and says how many would go', async () => {
    found.push({ id: 'id-1', syntheticLabel: 'Nadia Holm', userId: null });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main([]);
    expect(del).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('dry run: 1 athlete row(s) would be erased. Re-run with --yes.');
    log.mockRestore();
  });
});
