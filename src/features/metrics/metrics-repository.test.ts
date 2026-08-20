import { describe, it, expect, vi, beforeEach } from 'vitest';

// The same mocked-chain shape the other repository tests use. Each call gets
// one queued result set; `getMetricsInput` issues four reads in a fixed order,
// so the queue is drained in that order.
let queue: unknown[][] = [];

const CHAIN_METHODS = ['select', 'from', 'where', 'innerJoin'] as const;

function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  for (const m of CHAIN_METHODS) c[m] = () => c;
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    Promise.resolve(queue.shift() ?? []).then(resolve);
  return c;
}

vi.mock('@/db', () => ({ getDb: () => chain() }));

const { getMetricsInput, getAllAthleteIds } = await import('./metrics-repository');

beforeEach(() => {
  queue = [];
});

describe('getAllAthleteIds', () => {
  it('returns opaque ids and nothing that could name anybody', async () => {
    queue = [[{ id: 'a1' }, { id: 'a2' }]];
    expect(await getAllAthleteIds()).toEqual(['a1', 'a2']);
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
    ];

    const input = await getMetricsInput('a1');

    expect(input.sessions).toEqual([
      { date: '2026-08-17', status: 'completed', rated: true },
      { date: '2026-08-18', status: 'completed', rated: false },
    ]);
  });

  it('counts Weekly Session athlete turns per week, not per conversation', async () => {
    // "An extended discussion" is about how much the athlete said in a week —
    // two short Weekly Sessions in one week are still that week's conversation.
    queue = [
      [],
      [],
      [
        { createdAt: new Date('2026-08-17T09:00:00Z') },
        { createdAt: new Date('2026-08-17T09:05:00Z') },
        { createdAt: new Date('2026-08-24T09:00:00Z') },
      ],
      [],
    ];

    const input = await getMetricsInput('a1');

    expect(input.weeklySessionTurnsByWeek).toEqual({ '2026-08-17': 2, '2026-08-24': 1 });
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
    ];

    const input = await getMetricsInput('a1');

    expect(input.activityDays).toEqual(['2026-08-17', '2026-08-18']);
    expect(input.activityDays).not.toContain('2026-12-01');
  });

  it('carries the athlete through by opaque id', async () => {
    queue = [[], [], [], []];
    expect((await getMetricsInput('athlete_opaque_1')).athleteId).toBe('athlete_opaque_1');
  });
});
