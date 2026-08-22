import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  resolveAthleteId,
  completeSession,
  toggleSkipSession,
  toggleUnavailableSession,
  createAthleteSession,
  updateAthleteSession,
  deleteAthleteSession,
  revalidatePath,
} = vi.hoisted(() => ({
  resolveAthleteId: vi.fn(),
  completeSession: vi.fn(),
  toggleSkipSession: vi.fn(),
  toggleUnavailableSession: vi.fn(),
  createAthleteSession: vi.fn(),
  updateAthleteSession: vi.fn(),
  deleteAthleteSession: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/session/session-status', () => ({
  completeSession,
  toggleSkipSession,
  toggleUnavailableSession,
}));
vi.mock('@/features/session/athlete-session', () => ({
  createAthleteSession,
  updateAthleteSession,
  deleteAthleteSession,
}));

const {
  markCompleteAction,
  toggleSkipAction,
  toggleUnavailableAction,
  createAthleteSessionAction,
  updateAthleteSessionAction,
  deleteAthleteSessionAction,
} = await import('./session-actions');

/**
 * Six actions, one boundary each. The authority — what may be completed,
 * skipped, created or deleted — lives in `features/session`, and is tested
 * there. What is asserted here is the seam: the acting athlete comes from the
 * session and never from the request, `today` is the server's, and a refusal
 * revalidates nothing.
 */
const ATHLETE = 'athlete_1';
const NEW_SESSION = {
  date: '2026-07-16',
  type: 'Mobility',
  durationMin: 30,
  isTraining: false,
  note: null,
};

const services = [
  completeSession,
  toggleSkipSession,
  toggleUnavailableSession,
  createAthleteSession,
  updateAthleteSession,
  deleteAthleteSession,
];

beforeEach(() => {
  resolveAthleteId.mockReset();
  for (const service of services) service.mockReset();
  revalidatePath.mockClear();
});

describe('the status actions — complete, skip, unavailable', () => {
  const cases = [
    ['markCompleteAction', markCompleteAction, completeSession],
    ['toggleSkipAction', toggleSkipAction, toggleSkipSession],
    ['toggleUnavailableAction', toggleUnavailableAction, toggleUnavailableSession],
  ] as const;

  it.each(cases)('%s acts as the signed-in athlete, on the server clock', async (
    _name,
    action,
    service,
  ) => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    service.mockResolvedValue({ ok: true });

    await expect(action('sess_1')).resolves.toEqual({ ok: true });
    expect(service).toHaveBeenCalledWith({
      athleteId: ATHLETE,
      sessionId: 'sess_1',
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it.each(cases)('%s refuses a signed-out request', async (_name, action, service) => {
    resolveAthleteId.mockResolvedValue(null);

    await expect(action('sess_1')).resolves.toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(service).not.toHaveBeenCalled();
  });

  it.each(cases)('%s revalidates nothing when refused', async (_name, action, service) => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    // 'future' is the refusal an athlete meets on a session the Weekly Session
    // planned for next week — the one that blocked the smoke run.
    service.mockResolvedValue({ ok: false, reason: 'future' });

    await action('sess_1');

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('createAthleteSessionAction', () => {
  it('creates for the signed-in athlete, with the server clock for retro-logging', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    createAthleteSession.mockResolvedValue({ ok: true, sessionId: 'new_1' });

    const result = await createAthleteSessionAction(NEW_SESSION);

    expect(result).toEqual({ ok: true, sessionId: 'new_1' });
    // `today` decides whether this is a retro-log (created already completed)
    // or a future entry, so it must not come from the browser.
    expect(createAthleteSession).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: ATHLETE,
        today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('rejects a malformed date before resolving anyone', async () => {
    const result = await createAthleteSessionAction({ ...NEW_SESSION, date: 'saturday' });

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(resolveAthleteId).not.toHaveBeenCalled();
    expect(createAthleteSession).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await createAthleteSessionAction(NEW_SESSION);

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(createAthleteSession).not.toHaveBeenCalled();
  });
});

describe('updateAthleteSessionAction and deleteAthleteSessionAction', () => {
  const edit = { type: 'Strength', durationMin: 45, isTraining: true, note: 'Core.' };

  it('passes the acting athlete so the service can prove ownership', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    updateAthleteSession.mockResolvedValue({ ok: true });
    deleteAthleteSession.mockResolvedValue({ ok: true });

    await updateAthleteSessionAction('sess_1', edit);
    await deleteAthleteSessionAction('sess_1');

    // The id in the request is a claim; pairing it with the resolved athlete is
    // what lets the service refuse someone else's session (ADR 0006).
    expect(updateAthleteSession).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: ATHLETE, sessionId: 'sess_1' }),
    );
    expect(deleteAthleteSession).toHaveBeenCalledWith({
      athleteId: ATHLETE,
      sessionId: 'sess_1',
    });
  });

  it('both refuse a signed-out request', async () => {
    resolveAthleteId.mockResolvedValue(null);

    await expect(updateAthleteSessionAction('sess_1', edit)).resolves.toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    await expect(deleteAthleteSessionAction('sess_1')).resolves.toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(updateAthleteSession).not.toHaveBeenCalled();
    expect(deleteAthleteSession).not.toHaveBeenCalled();
  });
});
