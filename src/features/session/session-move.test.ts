import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionRow } from '@/db/schema';

// The DB is mocked so the authority logic can be tested without Postgres: the
// select returns a fixed row, and batch records whether a write happened.
const limit = vi.fn();
const batch = vi.fn().mockResolvedValue(undefined);
const updateWhere = vi.fn(() => ({}));
const updateSet = vi.fn(() => ({ where: updateWhere }));
const insertValues = vi.fn(() => ({}));

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
    update: () => ({ set: updateSet }),
    insert: () => ({ values: insertValues }),
    batch,
  }),
}));

const { moveSession } = await import('./session-move');

// Today is Wednesday 2026-07-15; the session sits on Thursday of the same week.
const TODAY = '2026-07-15';
const OWNER = 'athlete_owner';

function sessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'sess_1',
    athleteId: OWNER,
    date: '2026-07-16',
    type: 'Endurance',
    origin: 'coach',
    status: 'planned',
    parked: false,
    isTraining: true,
    duration: 60,
    zone: 'Zone 2',
    note: null,
    title: null,
    dayOrder: 0,
    startTime: null,
    sport: null,
    summary: null,
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    ratedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('moveSession — server authority', () => {
  beforeEach(() => {
    limit.mockReset();
    batch.mockClear();
    insertValues.mockClear();
    updateSet.mockClear();
  });

  it('applies a legal within-week move and records the event in one batch', async () => {
    limit.mockResolvedValue([sessionRow()]);

    const result = await moveSession({
      athleteId: OWNER,
      sessionId: 'sess_1',
      targetDate: '2026-07-18', // Saturday, same week, future
      today: TODAY,
    });

    expect(result).toEqual({ ok: true });
    // One atomic batch carries both the update and the event write.
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-07-18' }),
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: OWNER,
        actorType: 'athlete',
        actorId: OWNER,
        type: 'session_moved',
      }),
    );
  });

  it('refuses a client-forged illegal move — nothing is written', async () => {
    // The client claims a move, but the target is next week: the server re-runs
    // the rules against its own clock and bounces it. No write.
    limit.mockResolvedValue([sessionRow()]);

    const result = await moveSession({
      athleteId: OWNER,
      sessionId: 'sess_1',
      targetDate: '2026-07-20', // next Monday — cross-week
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'bounce' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses a move against another athlete’s session, even if otherwise legal', async () => {
    // The row belongs to someone else; the move is legal by the rules but the
    // caller does not own it. Ownership is checked before anything is written.
    limit.mockResolvedValue([sessionRow({ athleteId: 'someone_else' })]);

    const result = await moveSession({
      athleteId: OWNER,
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses to move a completed session — the record is immutable', async () => {
    limit.mockResolvedValue([sessionRow({ status: 'completed' })]);

    const result = await moveSession({
      athleteId: OWNER,
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'frozen' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('returns not-found when the session does not exist', async () => {
    limit.mockResolvedValue([]);

    const result = await moveSession({
      athleteId: OWNER,
      sessionId: 'missing',
      targetDate: '2026-07-18',
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(batch).not.toHaveBeenCalled();
  });
});
