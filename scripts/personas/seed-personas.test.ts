import { describe, it, expect, vi, beforeEach } from 'vitest';
import { athlete, injuries, sessions, unavailableDates } from '../../src/db/schema';

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, eq: vi.fn(actual.eq) };
});
const { eq } = await import('drizzle-orm');
import { personasFor } from '../../src/features/athlete/synthetic-history';

/**
 * The persona writer, lifted out of `scripts/seed.ts` so the tester kit can
 * seed a coach their own copy (code-health/18). The database is a chainable
 * fake that records every table and row it is handed: what matters here is
 * which rows are written with which ids, in what batch, and that the ids come
 * back in profile order for linking.
 */
const inserted: { table: unknown; row: unknown }[] = [];
const deleted: { table: unknown; where: unknown }[] = [];
const batches: unknown[][] = [];
const upsertTargetRace = vi.fn(() => Promise.resolve());

const conflictTargets: unknown[] = [];
function insertChain(table: unknown) {
  return {
    values: (row: unknown) => {
      inserted.push({ table, row });
      const q = { kind: 'insert', table, row };
      return {
        ...q,
        onConflictDoUpdate: (clause: { target: unknown; set: unknown }) => {
          conflictTargets.push(clause.target);
          expect(clause.set).toBe(row);
          return Promise.resolve(q);
        },
        onConflictDoNothing: () => ({ ...q, conflict: 'nothing' }),
      };
    },
  };
}
const db = {
  insert: vi.fn(insertChain),
  delete: vi.fn((table: unknown) => ({
    where: (where: unknown) => {
      deleted.push({ table, where });
      return { kind: 'delete', table };
    },
  })),
  batch: vi.fn((queries: unknown[]) => {
    batches.push(queries);
    return Promise.resolve();
  }),
};
vi.mock('../../src/db', () => ({ getDb: () => db }));
vi.mock('../../src/features/race/race-repository', () => ({ upsertTargetRace }));

const { seedPersonas } = await import('./seed-personas');

const NOW = new Date('2026-09-22T08:00:00Z');

describe('seedPersonas', () => {
  beforeEach(() => {
    inserted.length = 0;
    deleted.length = 0;
    conflictTargets.length = 0;
    batches.length = 0;
    db.insert.mockClear();
    upsertTargetRace.mockClear();
  });

  it('writes one athlete row per profile and returns the ids in the order it was given them', async () => {
    const profiles = personasFor('c@x.dk');
    const log = vi.fn();
    const ids = await seedPersonas(profiles, NOW, log);

    // The order is the contract the mint kit pairs labels back with.
    expect(ids).toEqual(profiles.map((p) => p.id));
    const athleteRows = inserted.filter((i) => i.table === athlete).map((i) => i.row);
    expect(athleteRows).toEqual(
      profiles.map((p) => expect.objectContaining({ id: p.id, syntheticLabel: p.syntheticLabel })),
    );
    expect(upsertTargetRace.mock.calls).toEqual([
      [ids[0], { name: 'First Ironman 70.3', date: '2027-06-19', distance: 'Half' }],
      [ids[1], { name: 'Ironman Copenhagen — sub 10:30', date: '2027-08-21', distance: 'Full' }],
      [ids[2], { name: 'Olympic distance — a personal best on the run', date: '2026-11-03', distance: 'Olympic' }],
    ]);
  });

  it('per profile, one batch: clear coach sessions and blocked dates, insert the history and the dates', async () => {
    const profiles = personasFor('c@x.dk');
    await seedPersonas(profiles, NOW, () => {});

    expect(batches).toHaveLength(3);
    const nadia = batches[2] as { kind: string; table: unknown; row?: unknown; conflict?: string }[];
    expect(nadia[0]).toMatchObject({ kind: 'delete', table: sessions });
    expect(nadia[1]).toMatchObject({ kind: 'delete', table: unavailableDates });
    expect(nadia[2]).toMatchObject({ kind: 'insert', table: sessions });
    expect((nadia[2].row as unknown[]).length).toBe(45);
    expect((nadia[2].row as { athleteId: string }[]).every((r) => r.athleteId === profiles[2].id)).toBe(true);
    expect(nadia.slice(3)).toEqual(
      Array.from({ length: 3 }, () =>
        expect.objectContaining({ kind: 'insert', table: unavailableDates, conflict: 'nothing' }),
      ),
    );
    expect((nadia[3].row as { athleteId: string; date: string }).athleteId).toBe(profiles[2].id);
    // Every delete is scoped to its own athlete: by table alone it would empty the coach's other personas.
    expect(deleted).toHaveLength(6);
    for (const d of deleted) expect(d.where).toBeDefined();
  });

  it("clears only the Coach's own sessions, leaving anything the athlete logged", async () => {
    const profiles = personasFor('c@x.dk');
    await seedPersonas(profiles, NOW, () => {});
    expect(vi.mocked(eq)).toHaveBeenCalledWith(sessions.origin, 'coach');
    expect(vi.mocked(eq)).toHaveBeenCalledWith(sessions.athleteId, profiles[0].id);
    expect(vi.mocked(eq)).toHaveBeenCalledWith(unavailableDates.athleteId, profiles[0].id);
  });

  it('replaces rather than duplicates: every upsert keys on the row id it derived', async () => {
    await seedPersonas(personasFor('c@x.dk'), NOW, () => {});
    expect(conflictTargets).toEqual([athlete.id, athlete.id, athlete.id, injuries.id]);
  });

  it("writes Nadia's copy's own injury id, and no injury for the other two", async () => {
    const profiles = personasFor('c@x.dk');
    await seedPersonas(profiles, NOW, () => {});
    const injuryRows = inserted.filter((i) => i.table === injuries).map((i) => i.row);
    expect(injuryRows).toEqual([
      expect.objectContaining({
        id: profiles[2].injury?.id,
        athleteId: profiles[2].id,
        run: 'none',
        bike: 'easy',
        swim: 'full',
        closedAt: null,
      }),
    ]);
    expect(injuryRows[0]).not.toMatchObject({ id: 'e4b0f3a5-6c7d-4e8f-9a01-3c4d5e6f7a8b' });
  });

  it('logs one line per persona, exactly as the seed always has', async () => {
    const log = vi.fn();
    await seedPersonas(personasFor('c@x.dk'), NOW, log);
    expect(log.mock.calls.map((c) => c[0])).toEqual([
      'Seeded persona Alex Rivera: 36 sessions over 10 weeks (3 skipped), 3 unavailable date(s), beginner, Half on 2027-06-19.',
      'Seeded persona Sam Chen: 54 sessions over 10 weeks (1 skipped), 3 unavailable date(s), veteran, Full on 2027-08-21.',
      'Seeded persona Nadia Holm: 45 sessions over 10 weeks (9 skipped), 3 unavailable date(s), intermediate, Olympic on 2026-11-03, one open Injury.',
    ]);
  });

  it('logs to the console when no logger is given', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await seedPersonas(personasFor('c@x.dk').slice(0, 1), NOW);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
