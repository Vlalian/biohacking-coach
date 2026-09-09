import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The thumbs at the trust boundary.
 *
 * The message id is the one client-supplied value on this path, so the tests
 * that matter are the refusals: another athlete's message, an athlete's own
 * turn, and a rating that is not one of the two.
 */
const { resolveAthleteId, flaggableCoachMessage, rateMessage, clearMessageRating } = vi.hoisted(
  () => ({
    resolveAthleteId: vi.fn(),
    flaggableCoachMessage: vi.fn(),
    rateMessage: vi.fn((_input: { comment: string | null }) => Promise.resolve()),
    clearMessageRating: vi.fn(() => Promise.resolve()),
  }),
);

vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/feedback/message-feedback-repository', () => ({
  flaggableCoachMessage,
  rateMessage,
  clearMessageRating,
}));

const { rateMessageAction, clearMessageRatingAction } = await import(
  './message-feedback-actions'
);

const OWNER = 'athlete_1';

beforeEach(() => {
  resolveAthleteId.mockReset().mockResolvedValue(OWNER);
  flaggableCoachMessage.mockReset().mockResolvedValue(true);
  rateMessage.mockClear();
  clearMessageRating.mockClear();
});

describe('rateMessageAction', () => {
  it('stores the flag for the athlete resolved from the session', async () => {
    expect(await rateMessageAction({ messageId: 'm1', rating: 'up' })).toEqual({ ok: true });

    // The athlete never arrives in the payload, so nothing a client sends can
    // steer which row is written (ADR 0006).
    expect(rateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: OWNER, messageId: 'm1', rating: 'up' }),
    );
  });

  it('refuses when nobody is signed in, and writes nothing', async () => {
    resolveAthleteId.mockResolvedValue(null);

    expect(await rateMessageAction({ messageId: 'm1', rating: 'up' })).toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(rateMessage).not.toHaveBeenCalled();
  });

  it('refuses a message this athlete may not flag, and writes nothing', async () => {
    // Covers both cases the repository query folds together: a message id from
    // someone else's thread, and the athlete's own turn.
    flaggableCoachMessage.mockResolvedValue(false);

    expect(await rateMessageAction({ messageId: 'm1', rating: 'up' })).toEqual({
      ok: false,
      reason: 'not-flaggable',
    });
    expect(rateMessage).not.toHaveBeenCalled();
  });

  it('refuses a rating that is not one of the two, before touching the database', async () => {
    expect(await rateMessageAction({ messageId: 'm1', rating: 'sideways' })).toEqual({
      ok: false,
      reason: 'bad-rating',
    });
    expect(flaggableCoachMessage).not.toHaveBeenCalled();
    expect(rateMessage).not.toHaveBeenCalled();
  });

  it('stores a trimmed comment, and nothing at all for a blank one', async () => {
    await rateMessageAction({ messageId: 'm1', rating: 'down', comment: '  too pushy  ' });
    expect(rateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ comment: 'too pushy' }),
    );

    await rateMessageAction({ messageId: 'm2', rating: 'down', comment: '   ' });
    expect(rateMessage).toHaveBeenLastCalledWith(expect.objectContaining({ comment: null }));

    await rateMessageAction({ messageId: 'm3', rating: 'down' });
    expect(rateMessage).toHaveBeenLastCalledWith(expect.objectContaining({ comment: null }));
  });

  it('caps a very long comment rather than refusing it', async () => {
    // The one line is in-the-moment; anything longer is the Feedback Interview's
    // job. Truncating keeps what they typed first rather than losing the lot.
    await rateMessageAction({ messageId: 'm1', rating: 'down', comment: 'x'.repeat(400) });

    const stored = rateMessage.mock.calls[0][0] as unknown as { comment: string };
    expect(stored.comment).toHaveLength(280);
  });
});

describe('clearMessageRatingAction', () => {
  it('removes the flag for the signed-in athlete', async () => {
    expect(await clearMessageRatingAction({ messageId: 'm1' })).toEqual({ ok: true });
    expect(clearMessageRating).toHaveBeenCalledWith({ athleteId: OWNER, messageId: 'm1' });
  });

  it('refuses a message this athlete may not flag', async () => {
    flaggableCoachMessage.mockResolvedValue(false);

    expect(await clearMessageRatingAction({ messageId: 'm1' })).toEqual({
      ok: false,
      reason: 'not-flaggable',
    });
    expect(clearMessageRating).not.toHaveBeenCalled();
  });

  it('refuses when nobody is signed in', async () => {
    resolveAthleteId.mockResolvedValue(null);

    expect(await clearMessageRatingAction({ messageId: 'm1' })).toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(clearMessageRating).not.toHaveBeenCalled();
  });
});
