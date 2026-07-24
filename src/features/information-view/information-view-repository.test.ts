import { describe, it, expect, vi, beforeEach } from 'vitest';

// Two chained reads share one mock db; each resolves what the test queues.
const orderBy = vi.fn();
const innerJoinWhere = vi.fn();
const where = vi.fn(() => ({ orderBy }));
const innerJoin = vi.fn(() => ({ where: innerJoinWhere }));

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({ where, innerJoin }),
    }),
  }),
}));

const { getInformationViewInputs } = await import('./information-view-repository');

describe('getInformationViewInputs', () => {
  beforeEach(() => {
    orderBy.mockReset();
    innerJoinWhere.mockReset();
  });

  it('returns builder-shaped rows and streams keyed by session id', async () => {
    orderBy.mockResolvedValue([
      {
        id: 's1',
        date: '2026-07-13',
        status: 'completed',
        isTraining: true,
        type: 'Endurance',
        title: 'Ride',
        duration: 60,
        sport: 'cycling',
        summary: { avgHr: 140 },
        feedbackBody: 4,
        feedbackMind: 5,
        feedbackComment: null,
      },
    ]);
    innerJoinWhere.mockResolvedValue([
      { sessionId: 's1', samples: { t: [0, 10], hr: [120, 130] } },
    ]);

    const { rows, streams } = await getInformationViewInputs('athlete_1');

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('s1');
    expect(streams).toEqual({ s1: { t: [0, 10], hr: [120, 130] } });
  });

  it('drops malformed stream payloads instead of passing them to the builder', async () => {
    orderBy.mockResolvedValue([]);
    innerJoinWhere.mockResolvedValue([
      { sessionId: 'bad1', samples: null },
      { sessionId: 'bad2', samples: 'not-an-object' },
      { sessionId: 'bad3', samples: { hr: [120] } }, // no t array
      { sessionId: 'ok', samples: { t: [0], powerW: [200], hr: 'junk' } },
    ]);

    const { streams } = await getInformationViewInputs('athlete_1');

    // Only the well-formed row survives, and its junk hr channel is omitted.
    expect(streams).toEqual({ ok: { t: [0], powerW: [200] } });
  });
});
