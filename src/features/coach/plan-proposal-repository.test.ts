import { describe, it, expect, vi, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { events } from '@/db/schema';

/**
 * The read side slice 09 added: when was this athlete's week last planned?
 *
 * Only the query's *shape* is asserted — athlete-scoped, written events only —
 * because deciding which week a write belongs to is `latestPlanWrittenAt`'s
 * job and is tested there. What this pins is that the SQL bounds the read to
 * one athlete (ADR 0006) and to writes, not proposals.
 */
const rows: unknown[] = [];
const orderBy = vi.fn(() => Promise.resolve(rows));
const where = vi.fn(() => ({ orderBy }));
const select = vi.fn(() => ({ from: () => ({ where }) }));

vi.mock('@/db', () => ({
  getDb: () => ({ select }),
}));

const { getLatestPlanWrittenAt } = await import('./plan-proposal-repository');

beforeEach(() => {
  rows.length = 0;
  where.mockClear();
  select.mockClear();
});

describe('getLatestPlanWrittenAt', () => {
  it('reads only this athlete\u2019s week_plan_written events, and only the columns latestPlanWrittenAt reads', async () => {
    await getLatestPlanWrittenAt('athlete_1', '2026-09-07');
    expect(where).toHaveBeenCalledWith(
      and(eq(events.athleteId, 'athlete_1'), eq(events.type, 'week_plan_written')),
    );
    expect(select).toHaveBeenCalledWith({
      type: events.type,
      payload: events.payload,
      createdAt: events.createdAt,
    });
  });

  it('returns the instant of the newest write covering the week, or null', async () => {
    rows.push(
      {
        type: 'week_plan_written',
        createdAt: new Date('2026-09-07T08:00:00Z'),
        payload: { conversationId: 'c1', sessions: [{ date: '2026-09-09' }] },
      },
      {
        type: 'week_plan_written',
        createdAt: new Date('2026-09-14T08:00:00Z'),
        payload: { conversationId: 'c2', sessions: [{ date: '2026-09-16' }] },
      },
    );
    expect(await getLatestPlanWrittenAt('athlete_1', '2026-09-07')).toEqual(
      new Date('2026-09-07T08:00:00Z'),
    );
    expect(await getLatestPlanWrittenAt('athlete_1', '2026-09-21')).toBeNull();
  });
});
