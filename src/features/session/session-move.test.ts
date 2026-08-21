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

const { moveSession, applyMove } = await import('./session-move');

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

describe('applyMove — the Head Coach as actor', () => {
  // Placement stopped being the athlete's alone on 2026-08-21 (ADR 0003
  // amendment). What matters here is that the *rules* did not fork: the coach
  // reaches the same function, so a move the athlete could not make is one the
  // coach cannot make either. Only the recorded actor differs.
  const COACH = 'head_coach_1';
  const asCoach = { type: 'head_coach', headCoachId: COACH } as const;

  beforeEach(() => {
    limit.mockReset();
    batch.mockClear();
    insertValues.mockClear();
    updateSet.mockClear();
  });

  it('records the coach as the actor, not the athlete', async () => {
    limit.mockResolvedValue([sessionRow()]);

    const result = await applyMove({
      athleteId: OWNER,
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: TODAY,
      actor: asCoach,
    });

    expect(result).toEqual({ ok: true });
    // The event is the material narration will need to tell the athlete who
    // moved their training (coached-mode/03).
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: OWNER,
        actorType: 'head_coach',
        actorId: COACH,
        type: 'session_moved',
      }),
    );
  });

  it('is refused by the same Move rules the athlete faces', async () => {
    // A completed session is frozen — the training record is immutable, and
    // outranking the AI does not mean outranking reality (ADR 0003).
    limit.mockResolvedValue([sessionRow({ status: 'completed' })]);

    const result = await applyMove({
      athleteId: OWNER,
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: TODAY,
      actor: asCoach,
    });

    expect(result).toEqual({ ok: false, reason: 'frozen' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses a session belonging to a different athlete', async () => {
    limit.mockResolvedValue([sessionRow({ athleteId: 'someone_else' })]);

    const result = await applyMove({
      athleteId: OWNER,
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: TODAY,
      actor: asCoach,
    });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('honours an origin gate before the Move rules run', async () => {
    // An Athlete Session is still the athlete's territory — that rule was NOT
    // reversed. The caller supplies the gate; this proves it is enforced here
    // rather than only in the UI.
    limit.mockResolvedValue([sessionRow({ origin: 'athlete' })]);

    const result = await applyMove({
      athleteId: OWNER,
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: TODAY,
      actor: asCoach,
      permittedOrigin: (origin) => origin !== 'athlete',
    });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('still records the athlete as actor on their own move', async () => {
    // The regression guard for the refactor: moveSession now delegates, and
    // must not start attributing an athlete's move to anyone else.
    limit.mockResolvedValue([sessionRow()]);

    await moveSession({
      athleteId: OWNER,
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: TODAY,
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'athlete', actorId: OWNER }),
    );
  });
});
