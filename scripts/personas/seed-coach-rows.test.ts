import { describe, it, expect, vi, beforeEach } from 'vitest';
import { coach, coachingLink } from '../../src/db/schema';

/**
 * The seed's two coach-row writers, lifted out of `scripts/seed.ts` so they can
 * be held to a test at all (code-health/24). `seed.ts` calls `guardDatabase`
 * and `seed()` at module scope and ends in `process.exit`, so nothing can
 * import it — which is why the dual-role path went unnoticed until a preview
 * crashed on it.
 *
 * The database is a chainable fake that records what it was handed, as
 * `seed-personas.test.ts` does it. What matters here is which columns the
 * insert claims the row by, and that a row which already exists is found
 * rather than fought over.
 */
const inserted: { table: unknown; row: unknown }[] = [];
const conflictTargets: unknown[] = [];
/** What `returning()` hands back; emptied to mean "the conflict clause won". */
const returningRows: { id: string }[] = [];
/** Queued results for the fallback lookup, oldest first. */
const selectRows: { id: string }[][] = [];
/** What each call asked to have returned, so the column is pinned. */
const returningShapes: unknown[] = [];

const insert = vi.fn((table: unknown) => ({
  values: (row: unknown) => {
    inserted.push({ table, row });
    return {
      onConflictDoNothing: (clause?: { target: unknown }) => {
        conflictTargets.push(clause?.target ?? null);
        // A link insert awaits the clause itself; a coach insert chains `returning`.
        return {
          returning: (shape: unknown) => {
            returningShapes.push(shape);
            return Promise.resolve([...returningRows]);
          },
          then: (resolve: (v: unknown) => void) => resolve(undefined),
        };
      },
    };
  },
}));

const select = vi.fn(() => {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(selectRows.shift() ?? []),
  };
  for (const verb of ['from', 'where', 'limit']) chain[verb] = () => chain;
  return chain;
});

vi.mock('../../src/db', () => ({ getDb: () => ({ insert, select }) }));

const { ensureCoachRow, linkAthletes } = await import('./seed-coach-rows');

describe('ensureCoachRow', () => {
  beforeEach(() => {
    inserted.length = 0;
    conflictTargets.length = 0;
    returningRows.length = 0;
    returningShapes.length = 0;
    selectRows.length = 0;
    vi.clearAllMocks();
  });

  it('inserts the row and returns the id it got back', async () => {
    returningRows.push({ id: 'coach-new' });
    expect(await ensureCoachRow('user-1')).toBe('coach-new');
    expect(inserted).toEqual([{ table: coach, row: { userId: 'user-1' } }]);
  });

  it('lets the database choose the id, and claims the row by its user', async () => {
    // The bug this replaces: a fixed primary key under a clause that guards
    // `user_id` only, so a branch already holding that id raised `coach_pkey`.
    returningRows.push({ id: 'coach-new' });
    await ensureCoachRow('user-1');
    expect(inserted[0]?.row).not.toHaveProperty('id');
    expect(conflictTargets).toEqual([coach.userId]);
    // The id the database chose is the one thing the caller needs back.
    expect(returningShapes).toEqual([{ id: coach.id }]);
  });

  it('falls back to the row that exists when the conflict clause wins', async () => {
    selectRows.push([{ id: 'coach-existing' }]);
    expect(await ensureCoachRow('user-1')).toBe('coach-existing');
    expect(select).toHaveBeenCalledWith({ id: coach.id });
  });

  it('refuses to carry on without a coach id', async () => {
    selectRows.push([]);
    await expect(ensureCoachRow('user-1')).rejects.toThrow(/coach row missing for user user-1/i);
  });
});

describe('linkAthletes', () => {
  beforeEach(() => {
    inserted.length = 0;
    conflictTargets.length = 0;
    vi.clearAllMocks();
  });

  it('links each athlete once, to the coach it was given', async () => {
    await linkAthletes('coach-1', ['ath-a', 'ath-b']);
    expect(inserted).toEqual([
      { table: coachingLink, row: { coachId: 'coach-1', athleteId: 'ath-a' } },
      { table: coachingLink, row: { coachId: 'coach-1', athleteId: 'ath-b' } },
    ]);
  });

  it('leaves an existing link alone, so a reseed adds nothing', async () => {
    await linkAthletes('coach-1', ['ath-a']);
    // The partial unique index guards the active pair; the clause names no
    // target because that index is the only one an active pair can hit.
    expect(conflictTargets).toEqual([null]);
  });

  it('writes nothing for a coach with nobody to coach', async () => {
    await linkAthletes('coach-1', []);
    expect(inserted).toEqual([]);
  });
});
