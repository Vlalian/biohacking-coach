import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// The same mocked-chain shape the other repository tests use. Each call gets
// one queued result set; `getMetricsInput` issues five reads in a fixed order,
// so the queue is drained in that order. `.where()` arguments are captured so
// the conversation kinds each read names can be rendered and asserted.
let queue: unknown[][] = [];
let whereArgs: unknown[] = [];
let selectArgs: unknown[] = [];

const CHAIN_METHODS = ['from', 'innerJoin'] as const;

function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  for (const m of CHAIN_METHODS) c[m] = () => c;
  c.select = (projection: unknown) => {
    selectArgs.push(projection);
    return c;
  };
  c.where = (arg: unknown) => {
    whereArgs.push(arg);
    return c;
  };
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    Promise.resolve(queue.shift() ?? []).then(resolve);
  return c;
}

vi.mock('@/db', () => ({ getDb: () => chain() }));

const { getMetricsInput, getAllAthleteIds } = await import('./metrics-repository');

beforeEach(() => {
  queue = [];
  whereArgs = [];
  selectArgs = [];
});

describe('getAllAthleteIds', () => {
  it('returns opaque ids and nothing that could name anybody', async () => {
    queue = [[{ id: 'a1' }, { id: 'a2' }]];
    expect(await getAllAthleteIds()).toEqual(['a1', 'a2']);
    // The projection is the guarantee: only the id column is ever asked for.
    expect(selectArgs.map((p) => Object.keys(p as object))).toEqual([['id']]);
  });
});

describe('getMetricsInput', () => {
  it('treats a session as rated only when it carries a ratedAt stamp', async () => {
    queue = [
      [
        { date: '2026-08-17', status: 'completed', ratedAt: new Date('2026-08-17') },
        { date: '2026-08-18', status: 'completed', ratedAt: null },
      ],
      [],
      [],
      [],
      [],
    ];

    const input = await getMetricsInput('a1');

    expect(input.sessions).toEqual([
      { date: '2026-08-17', status: 'completed', rated: true },
      { date: '2026-08-18', status: 'completed', rated: false },
    ]);
  });

  it('reads declined Week Plan proposals as the in-session engagement signal', async () => {
    // Read order: sessions, chat turns, weekly turns, moves, declines.
    queue = [
      [],
      [],
      [],
      [],
      [{ createdAt: new Date('2026-08-19T09:00:00Z') }],
    ];

    const input = await getMetricsInput('a1');

    expect(input.planDeclinedWeeks).toEqual(['2026-08-17']);
  });

  it('keeps Weekly Session turns for activity only, never as engagement', async () => {
    queue = [
      [],
      [],
      [
        { createdAt: new Date('2026-08-17T09:00:00Z') },
        { createdAt: new Date('2026-08-17T09:05:00Z') },
      ],
      [],
      [],
    ];

    const input = await getMetricsInput('a1');
    expect(input.planDeclinedWeeks).toEqual([]);
    expect(input.activityDays).toEqual(['2026-08-17', '2026-08-17']);
  });

  it('counts only sessions that actually happened as activity, not the plan', async () => {
    // Retention measures whether the habit took hold. Counting planned sessions
    // would measure how far ahead the Coach has built the calendar instead.
    queue = [
      [
        { date: '2026-08-17', status: 'completed', ratedAt: null },
        { date: '2026-08-18', status: 'skipped', ratedAt: null },
        { date: '2026-12-01', status: 'planned', ratedAt: null },
      ],
      [],
      [],
      [],
      [],
    ];

    const input = await getMetricsInput('a1');

    expect(input.activityDays).toEqual(['2026-08-17', '2026-08-18']);
    expect(input.activityDays).not.toContain('2026-12-01');
  });

  it('reads engagement from coach_chat and activity from the retired weekly_session too (training-architecture/21)', async () => {
    // The Weekly Session is retired and nothing writes its kind any more. The
    // engagement read is Coach Chat's — the one conversation — so it does not
    // decay to zero after the change; the old kind's turns stay activity, or
    // retention would forget every tester who was here before it.
    queue = [[], [], [], [], []];
    await getMetricsInput('a1');

    // Read order: sessions, chat turns, weekly turns, moves, declines.
    const [, chatTurns, weeklyTurns] = whereArgs.map((arg) => new PgDialect().sqlToQuery(arg as SQL));
    expect(chatTurns.sql).toContain(`"kind" = 'coach_chat'`);
    expect(chatTurns.sql).toContain(`"role" = 'athlete'`);
    expect(chatTurns.params).toEqual(['a1']);
    expect(weeklyTurns.sql).toContain(`"kind" = 'weekly_session'`);
    expect(weeklyTurns.sql).toContain(`"role" = 'athlete'`);
    expect(weeklyTurns.params).toEqual(['a1']);
  });

  it('asks each table for exactly the columns the arithmetic needs, and names the two event types', async () => {
    queue = [[], [], [], [], []];
    await getMetricsInput('a1');

    expect(selectArgs.map((p) => Object.keys(p as object))).toEqual([
      ['date', 'status', 'ratedAt'],
      ['createdAt'],
      ['createdAt'],
      ['createdAt'],
      ['createdAt'],
    ]);
    const [, , , moves, declines] = whereArgs.map((arg) => new PgDialect().sqlToQuery(arg as SQL));
    expect(moves.sql).toContain(`"type" = 'session_moved'`);
    expect(declines.sql).toContain(`"type" = 'week_plan_declined'`);
    expect(declines.sql).toContain(`"actor_type" = 'athlete'`);
  });

  it('dates Coach Chat turns and moves by their day, and buckets chat turns by week', async () => {
    // Read order: sessions, chat turns, weekly turns, moves, declines.
    queue = [
      [],
      [{ createdAt: new Date('2026-08-19T09:00:00Z') }],
      [],
      [{ createdAt: new Date('2026-08-20T18:30:00Z') }],
      [],
    ];

    const input = await getMetricsInput('a1');

    expect(input.chatTurnWeeks).toEqual(['2026-08-17']);
    expect(input.activityDays).toEqual(['2026-08-19']);
    expect(input.moveEventDates).toEqual(['2026-08-20']);
  });

  it('carries the athlete through by opaque id', async () => {
    queue = [[], [], [], [], []];
    expect((await getMetricsInput('athlete_opaque_1')).athleteId).toBe('athlete_opaque_1');
  });
});
