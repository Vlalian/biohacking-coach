import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveAthleteId, moveSession, revalidatePath } = vi.hoisted(() => ({
  resolveAthleteId: vi.fn(),
  moveSession: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/session/session-move', () => ({ moveSession }));

const { moveSessionAction } = await import('./move-actions');

/**
 * The action is a four-line wrapper, and every line of it is a boundary: who is
 * acting, what clock the rules are judged against, and whether the request is
 * even well-formed. The Move rules themselves are proven in
 * `features/session/session-move.test.ts` — what is asserted here is that the
 * client cannot reach around them.
 */
describe('moveSessionAction', () => {
  beforeEach(() => {
    resolveAthleteId.mockReset();
    moveSession.mockReset();
    revalidatePath.mockClear();
  });

  it('resolves the acting athlete from the session and supplies the server clock', async () => {
    resolveAthleteId.mockResolvedValue('athlete_1');
    moveSession.mockResolvedValue({ ok: true });

    const result = await moveSessionAction('sess_1', '2026-07-18');

    expect(result).toEqual({ ok: true });
    // `today` is the server's, so the Move rules cannot be judged against a
    // clock the browser chose.
    expect(moveSession).toHaveBeenCalledWith({
      athleteId: 'athlete_1',
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('rejects a malformed target date before resolving anyone', async () => {
    const result = await moveSessionAction('sess_1', 'next tuesday');

    expect(result).toEqual({ ok: false, reason: 'bounce' });
    expect(resolveAthleteId).not.toHaveBeenCalled();
    expect(moveSession).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request without touching the plan', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await moveSessionAction('sess_1', '2026-07-18');

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(moveSession).not.toHaveBeenCalled();
  });

  it('revalidates only when something actually moved', async () => {
    resolveAthleteId.mockResolvedValue('athlete_1');
    moveSession.mockResolvedValue({ ok: false, reason: 'frozen' });

    await moveSessionAction('sess_1', '2026-07-18');

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
