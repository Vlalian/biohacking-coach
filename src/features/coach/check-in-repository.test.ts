import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkIns, type CheckInRow } from '@/db/schema';

const rows: CheckInRow[] = [];

const limit = vi.fn(() => Promise.resolve(rows));
const selectWhere = vi.fn(() => ({ limit }));

const inserted: unknown[] = [];
const onConflictDoUpdate = vi.fn((config: unknown) => {
  inserted[inserted.length - 1] = { ...(inserted[inserted.length - 1] as object), config };
  return Promise.resolve();
});
const insertValues = vi.fn((v: unknown) => {
  inserted.push({ values: v });
  return { onConflictDoUpdate };
});

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: selectWhere }) }),
    insert: () => ({ values: insertValues }),
  }),
}));

import type { CheckInReport } from './check-in-repository';

const { getCheckInForWeek, saveCheckIn } = await import('./check-in-repository');

beforeEach(() => {
  rows.length = 0;
  inserted.length = 0;
  vi.clearAllMocks();
});

describe('a Check-in belongs to one week', () => {
  it('reads back the week it was filed for', async () => {
    rows.push({
      id: 'ci_1',
      athleteId: 'athlete_1',
      weekStart: '2026-09-07',
      energy: 6,
      body: 7,
      sleepQuality: 5,
      notableSignal: 'calf felt tight Thursday',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const checkIn = await getCheckInForWeek('athlete_1', '2026-09-07');

    expect(checkIn).toMatchObject({ energy: 6, body: 7, sleepQuality: 5 });
  });

  it('is null when the athlete has not filed one, which is an ordinary week', async () => {
    // Most weeks, for most athletes. The Weekly Session is not a gate
    // (ADR 0007), so skipping it has to be a state the whole path handles.
    expect(await getCheckInForWeek('athlete_1', '2026-09-07')).toBeNull();
  });

  it('replaces rather than duplicates when the same week is filed twice', async () => {
    // An athlete correcting Monday's answer on Tuesday is editing one report,
    // not filing two. The unique index makes that a database rule; this is the
    // write that relies on it.
    await saveCheckIn('athlete_1', '2026-09-07', {
      energy: 6,
      body: 7,
      sleepQuality: 5,
      notableSignal: null,
    });

    const [call] = inserted as {
      values: unknown;
      config?: { target?: unknown[]; set?: Record<string, unknown> };
    }[];
    expect(call.values).toMatchObject({ athleteId: 'athlete_1', weekStart: '2026-09-07' });
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);

    // The conflict is (athlete, week) — the pair the unique index is on. Named
    // here because a target that drifted to just the athlete would silently make
    // this "one Check-in ever" instead of "one per week", and the insert would
    // still succeed.
    expect(call.config?.target).toEqual([checkIns.athleteId, checkIns.weekStart]);

    // And the replacement carries the whole report plus a fresh `updatedAt`.
    // An empty `set` is the failure that looks most like success: the write
    // returns fine and the athlete's correction is silently discarded.
    expect(call.config?.set).toMatchObject({ energy: 6, body: 7, sleepQuality: 5 });
    expect(call.config?.set?.updatedAt).toBeInstanceOf(Date);
  });
});

describe('a partial Check-in cannot be constructed', () => {
  it('refuses a report missing any of the three scores', async () => {
    // The rule `code-health/07` left behind: a half-filled readiness rendered as
    // none at all *and* had the prompt tell the model there was none. Refusing
    // at the boundary is what keeps "the Coach was told what the athlete said"
    // true in both directions.
    for (const partial of [
      { energy: 6, body: 7, notableSignal: null },
      { energy: 6, sleepQuality: 5, notableSignal: null },
      { body: 7, sleepQuality: 5, notableSignal: null },
      {},
    ]) {
      await expect(
        saveCheckIn('athlete_1', '2026-09-07', partial as unknown as CheckInReport),
      ).rejects.toThrow(/complete/i);
    }
  });

  it('refuses a score outside 1-10 rather than storing it', async () => {
    for (const bad of [0, 11, -1, 4.5, Number.NaN]) {
      await expect(
        saveCheckIn('athlete_1', '2026-09-07', {
          energy: bad,
          body: 7,
          sleepQuality: 5,
          notableSignal: null,
        }),
      ).rejects.toThrow();
    }
  });

  it('accepts both ends of the scale', async () => {
    // The bounds themselves, on the inside. An athlete having their worst week
    // or their best one is reporting a real thing, and a range that quietly
    // excluded 1 and 10 would refuse the two answers that matter most.
    for (const score of [1, 10]) {
      await expect(
        saveCheckIn('athlete_1', '2026-09-07', {
          energy: score,
          body: score,
          sleepQuality: score,
          notableSignal: null,
        }),
      ).resolves.toBeUndefined();
    }
  });

  it('says which field was wrong, and why it matters', async () => {
    // The message is the whole value of asserting here rather than letting the
    // database constraint fire: a Postgres check violation names a constraint,
    // not a question the athlete was asked.
    await expect(
      saveCheckIn('athlete_1', '2026-09-07', {
        energy: 6,
        body: 7,
        sleepQuality: 99,
        notableSignal: null,
      }),
    ).rejects.toThrow(/sleepQuality must be a whole score from 1 to 10, got 99/);

    // And why, not just what. The reason is the non-obvious half — a partial
    // Check-in is not a smaller Check-in, it renders as no Check-in at all — so
    // it belongs in the error rather than only in a comment nobody hits.
    await expect(
      saveCheckIn('athlete_1', '2026-09-07', {
        energy: 6,
        body: 7,
        sleepQuality: 99,
        notableSignal: null,
      }),
    ).rejects.toThrow(/render to the Coach as none at all/);
  });

  it('accepts a Check-in with no notable signal — that half is optional', async () => {
    // The three scores are the report; the sentence is the athlete's own words,
    // and most weeks there is nothing to say.
    await expect(
      saveCheckIn('athlete_1', '2026-09-07', {
        energy: 6,
        body: 7,
        sleepQuality: 5,
        notableSignal: null,
      }),
    ).resolves.toBeUndefined();
  });
});
