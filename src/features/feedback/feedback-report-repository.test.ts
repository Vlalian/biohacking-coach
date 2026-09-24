import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// The same mocked-chain shape `metrics-repository.test.ts` uses. Each read gets
// one queued result set; `getFeedbackReportInput` issues three reads in a fixed
// order — conversations, messages, athlete_feedback — so the queue drains in
// that order. `.where()` and `.select()` arguments are captured so the kind
// filter and the projections can be asserted.
let queue: unknown[][] = [];
let whereArgs: unknown[] = [];
let selectArgs: unknown[] = [];

const CHAIN_METHODS = ['from', 'innerJoin', 'orderBy'] as const;

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

const { getFeedbackReportInput } = await import('./feedback-report-repository');

beforeEach(() => {
  queue = [];
  whereArgs = [];
  selectArgs = [];
});

describe('getFeedbackReportInput', () => {
  it('reads only the feedback kind, for the conversations and for their turns', async () => {
    queue = [[], [], []];
    await getFeedbackReportInput();

    // Two filtered reads: conversations, then messages joined to them. The
    // athlete_feedback read has no where — every row is a feedback row.
    const rendered = whereArgs.map((arg) => new PgDialect().sqlToQuery(arg as SQL));
    expect(rendered).toHaveLength(2);
    for (const q of rendered) {
      expect(q.sql).toContain('"kind" = ');
      expect(q.params).toEqual(['feedback']);
    }
  });

  it('asks for opaque ids and the words, never a column that could name anybody', async () => {
    queue = [[], [], []];
    await getFeedbackReportInput();

    expect(selectArgs.map((p) => Object.keys(p as object))).toEqual([
      ['id', 'athleteId', 'createdAt'],
      ['conversationId', 'role', 'content', 'createdAt'],
      ['athleteId', 'kind', 'body', 'view', 'conversationId', 'coachFailureReason', 'createdAt'],
    ]);
  });

  it('assembles each interview with its own turns and passes the feedback rows through', async () => {
    const t0 = new Date('2026-09-20T09:00:00Z');
    queue = [
      [
        { id: 'conv_1', athleteId: 'athlete_1', createdAt: t0 },
        { id: 'conv_2', athleteId: 'athlete_2', createdAt: t0 },
      ],
      [
        { conversationId: 'conv_1', role: 'athlete', content: 'one', createdAt: t0 },
        { conversationId: 'conv_2', role: 'athlete', content: 'other', createdAt: t0 },
        { conversationId: 'conv_1', role: 'coach_ai', content: 'two', createdAt: t0 },
      ],
      [
        {
          athleteId: 'athlete_1',
          kind: 'trust_signal',
          body: 'no',
          view: null,
          conversationId: 'conv_1',
          coachFailureReason: null,
          createdAt: t0,
        },
      ],
    ];

    const input = await getFeedbackReportInput();

    expect(input.interviews).toEqual([
      {
        athleteId: 'athlete_1',
        conversationId: 'conv_1',
        startedAt: t0,
        turns: [
          { role: 'athlete', content: 'one', createdAt: t0 },
          { role: 'coach_ai', content: 'two', createdAt: t0 },
        ],
      },
      {
        athleteId: 'athlete_2',
        conversationId: 'conv_2',
        startedAt: t0,
        turns: [{ role: 'athlete', content: 'other', createdAt: t0 }],
      },
    ]);
    expect(input.feedback).toEqual([expect.objectContaining({ kind: 'trust_signal', body: 'no' })]);
  });
});
