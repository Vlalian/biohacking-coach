import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const orderBy = vi.fn();
const where = vi.fn((_condition: SQL) => ({ orderBy }));

const select = vi.fn((_columns: Record<string, unknown>) => ({ from: () => ({ where }) }));

vi.mock('@/db', () => ({ getDb: () => ({ select }) }));

const { getSessionMovesSince } = await import('./session-move-repository');

/**
 * The week's Session Moves as the Coach reads them (`training-architecture/52`):
 * the `session_moved` events already written by every move, read back.
 */
describe('getSessionMovesSince', () => {
  beforeEach(() => {
    select.mockClear();
    where.mockClear();
    orderBy.mockReset();
  });

  it("reads this athlete's session_moved events from the given day on", async () => {
    orderBy.mockResolvedValue([]);
    await getSessionMovesSince('athlete_1', '2026-09-28');

    const { sql, params } = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(sql).toContain('"athlete_id" = $1');
    expect(sql).toContain('"type" = $2');
    expect(sql).toContain('"created_at" >= $3');
    expect(params[0]).toBe('athlete_1');
    expect(params[1]).toBe('session_moved');
    expect(params[2]).toBe(new Date('2026-09-28T00:00:00').toISOString());
  });

  it('gives each move its days and who made it', async () => {
    orderBy.mockResolvedValue([
      { actorType: 'athlete', payload: { sessionId: 's1', from: '2026-09-29', to: '2026-10-01' } },
      { actorType: 'head_coach', payload: { sessionId: 's2', from: '2026-09-30', to: '2026-10-02' } },
    ]);
    expect(await getSessionMovesSince('athlete_1', '2026-09-28')).toEqual([
      { from: '2026-09-29', to: '2026-10-01', by: 'athlete' },
      { from: '2026-09-30', to: '2026-10-02', by: 'head_coach' },
    ]);
  });

  it('drops an event whose payload does not say where from and where to', async () => {
    orderBy.mockResolvedValue([
      { actorType: 'athlete', payload: null },
      { actorType: 'athlete', payload: { from: '2026-09-29' } },
      { actorType: 'athlete', payload: { to: '2026-09-29' } },
      { actorType: 'athlete', payload: { from: 3, to: '2026-09-29' } },
    ]);
    expect(await getSessionMovesSince('athlete_1', '2026-09-28')).toEqual([]);
  });
});
