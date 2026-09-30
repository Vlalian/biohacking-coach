import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const limit = vi.fn();
const orderBy = vi.fn(() => ({ limit }));
const where = vi.fn((_condition: SQL) => ({ orderBy }));
const innerJoin = vi.fn(() => ({ where }));
const select = vi.fn((_columns: Record<string, unknown>) => ({ from: () => ({ innerJoin }) }));

vi.mock('@/db', () => ({ getDb: () => ({ select }) }));

const { getRecentAthleteChatLines } = await import('./chat-excerpt-repository');

/**
 * What the athlete said in Coach Chat lately, for the week draft (Mads's ruling
 * E2, 2026-09-29): their own words, a few lines, never the Coach's side and
 * never the whole transcript.
 */
describe('getRecentAthleteChatLines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limit.mockResolvedValue([]);
  });

  it("reads only this athlete's own Coach Chat lines from the given day on, newest first, a few at most", async () => {
    await getRecentAthleteChatLines('athlete_1', '2026-09-22');

    const { sql, params } = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(sql).toContain('"conversations"."athlete_id" = $1');
    expect(sql).toContain('"conversations"."kind" = $2');
    expect(sql).toContain('"messages"."role" = $3');
    expect(sql).toContain('"messages"."created_at" >= $4');
    expect(params.slice(0, 3)).toEqual(['athlete_1', 'coach_chat', 'athlete']);
    expect(params[3]).toBe(new Date('2026-09-22T00:00:00').toISOString());
    expect(limit).toHaveBeenCalledWith(5);
  });

  it('gives the lines back oldest first', async () => {
    limit.mockResolvedValue([{ content: 'knee tight Tue' }, { content: 'legs heavy' }]);
    expect(await getRecentAthleteChatLines('athlete_1', '2026-09-22')).toEqual(['legs heavy', 'knee tight Tue']);
  });
});
