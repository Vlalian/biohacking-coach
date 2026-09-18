import { describe, it, expect, vi, beforeEach } from 'vitest';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
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
const limit = vi.fn(() => Promise.resolve(rows));
// Awaitable straight from orderBy (the existing reads), or narrowed by limit first.
const orderBy = vi.fn(() => Object.assign(Promise.resolve(rows), { limit }));
const where = vi.fn(() => ({ orderBy }));
const select = vi.fn(() => ({ from: () => ({ where }) }));

vi.mock('@/db', () => ({
  getDb: () => ({ select }),
}));

const { getLatestPlanWrittenAt, latestPlanDecision } = await import('./plan-proposal-repository');

beforeEach(() => {
  rows.length = 0;
  where.mockClear();
  select.mockClear();
  orderBy.mockClear();
  limit.mockClear();
});

/**
 * training-architecture/24: a week handed to a conversation is decided there,
 * and the chat's decisions carry a conversation, not a week. This is how the
 * draft history learns what the athlete decided after the handoff.
 */
describe('latestPlanDecision — the newest written/declined for a conversation after a moment', () => {
  const SINCE = new Date('2026-09-16T09:00:00Z');

  it('reads both decision types for the conversation, newer than since, newest first, one row', async () => {
    rows.push({ type: 'week_plan_declined' });
    expect(await latestPlanDecision('athlete_1', 'c1', SINCE)).toBe('declined');
    expect(where).toHaveBeenCalledWith(
      and(
        eq(events.athleteId, 'athlete_1'),
        inArray(events.type, ['week_plan_written', 'week_plan_declined']),
        sql`${events.payload} ->> 'conversationId' = ${'c1'}`,
        gt(events.createdAt, SINCE),
      ),
    );
    expect(orderBy).toHaveBeenCalledWith(desc(events.createdAt));
    expect(limit).toHaveBeenCalledWith(1);
    expect(select).toHaveBeenCalledWith({ type: events.type });
  });

  it('written when that is newest, null when nothing was decided', async () => {
    rows.push({ type: 'week_plan_written' });
    expect(await latestPlanDecision('athlete_1', 'c1', SINCE)).toBe('written');
    rows.length = 0;
    expect(await latestPlanDecision('athlete_1', 'c1', SINCE)).toBeNull();
  });
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
