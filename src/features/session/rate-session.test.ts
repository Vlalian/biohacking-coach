import { describe, it, expect, vi, beforeEach } from 'vitest';

const limit = vi.fn();
const updateWhere = vi.fn().mockResolvedValue(undefined);
const updateSet = vi.fn<(values: Record<string, unknown>) => { where: typeof updateWhere }>(
  () => ({ where: updateWhere }),
);
const update = vi.fn(() => ({ set: updateSet }));

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
    update,
  }),
}));

const { rateSession } = await import('./rate-session');

const OWNER = 'athlete_owner';

describe('rateSession — server authority', () => {
  beforeEach(() => {
    limit.mockReset();
    update.mockClear();
    updateSet.mockClear();
  });

  it('writes the rating and stamps rated_at for an owned session', async () => {
    limit.mockResolvedValue([{ athleteId: OWNER }]);

    const result = await rateSession({
      athleteId: OWNER,
      sessionId: 'sess_1',
      body: 4,
      mind: 3,
      comment: '  legs heavy  ',
    });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        feedbackBody: 4,
        feedbackMind: 3,
        feedbackComment: 'legs heavy', // trimmed
      }),
    );
    // rated_at is set on every write, so a re-rate updates the timestamp.
    expect(updateSet.mock.calls[0][0]).toHaveProperty('ratedAt');
  });

  it('stores a blank comment as null, not an empty string', async () => {
    limit.mockResolvedValue([{ athleteId: OWNER }]);

    await rateSession({ athleteId: OWNER, sessionId: 'sess_1', body: 2, mind: 2, comment: '   ' });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ feedbackComment: null }),
    );
  });

  it('re-rates: a second rating overwrites the first', async () => {
    limit.mockResolvedValue([{ athleteId: OWNER }]);

    await rateSession({ athleteId: OWNER, sessionId: 'sess_1', body: 1, mind: 1, comment: null });
    await rateSession({ athleteId: OWNER, sessionId: 'sess_1', body: 5, mind: 4, comment: null });

    expect(update).toHaveBeenCalledTimes(2);
    expect(updateSet.mock.calls[1][0]).toMatchObject({ feedbackBody: 5, feedbackMind: 4 });
  });

  it('refuses a rating on another athlete’s session — nothing is written', async () => {
    limit.mockResolvedValue([{ athleteId: 'someone_else' }]);

    const result = await rateSession({
      athleteId: OWNER,
      sessionId: 'sess_1',
      body: 3,
      mind: 3,
      comment: null,
    });

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects out-of-range scores before touching the database', async () => {
    for (const [body, mind] of [
      [0, 3],
      [6, 3],
      [3, 5.5],
    ]) {
      const result = await rateSession({
        athleteId: OWNER,
        sessionId: 'sess_1',
        body,
        mind,
        comment: null,
      });
      expect(result).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(update).not.toHaveBeenCalled();
  });

  it('returns not-found when the session does not exist', async () => {
    limit.mockResolvedValue([]);

    const result = await rateSession({
      athleteId: OWNER,
      sessionId: 'missing',
      body: 3,
      mind: 3,
      comment: null,
    });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(update).not.toHaveBeenCalled();
  });
});
