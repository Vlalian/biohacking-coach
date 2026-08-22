import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  resolveAthleteWithLanguage,
  assertAiCoachingConsent,
  startWeeklySession,
  continueWeeklySession,
  commitWeeklyPlan,
  declineWeeklyPlan,
  revalidatePath,
} = vi.hoisted(() => ({
  resolveAthleteWithLanguage: vi.fn(),
  assertAiCoachingConsent: vi.fn(),
  startWeeklySession: vi.fn(),
  continueWeeklySession: vi.fn(),
  commitWeeklyPlan: vi.fn(),
  declineWeeklyPlan: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteWithLanguage }));
vi.mock('@/features/consent/consent-gate', () => ({ assertAiCoachingConsent }));
vi.mock('@/features/coach/weekly-session-service', () => ({
  startWeeklySession,
  continueWeeklySession,
  commitWeeklyPlan,
  declineWeeklyPlan,
}));

const {
  startWeeklySessionAction,
  sendWeeklyMessageAction,
  commitWeeklyPlanAction,
  declineWeeklyPlanAction,
} = await import('./weekly-actions');

/**
 * The Weekly Session is the one path that writes a whole week, so its boundary
 * carries the most. Two things are asserted here that the service cannot check
 * for itself: that consent gates the turns which reach the model, and that
 * confirming a plan is the only action which refreshes the calendar.
 *
 * Note the deliberate asymmetry — commit and decline do NOT re-check consent.
 * They act on a proposal the athlete is already looking at, and neither sends
 * anything to the API; a consent check there would refuse an athlete the
 * ability to *cancel*, which would be exactly backwards.
 */
const ATHLETE = { id: 'athlete_1' };
const CONVERSATION = 'conv_1';

beforeEach(() => {
  resolveAthleteWithLanguage.mockReset();
  assertAiCoachingConsent.mockReset();
  startWeeklySession.mockReset();
  continueWeeklySession.mockReset();
  commitWeeklyPlan.mockReset();
  declineWeeklyPlan.mockReset();
  revalidatePath.mockClear();
});

describe('the turns that reach the Coach', () => {
  const cases = [
    ['startWeeklySessionAction', () => startWeeklySessionAction(), startWeeklySession],
    [
      'sendWeeklyMessageAction',
      () => sendWeeklyMessageAction(CONVERSATION, 'Tuesday is tight.'),
      continueWeeklySession,
    ],
  ] as const;

  it.each(cases)('%s passes the athlete, the server date and their language', async (
    _name,
    call,
    service,
  ) => {
    resolveAthleteWithLanguage.mockResolvedValue({
      ok: true,
      athlete: ATHLETE,
      language: 'da',
    });
    assertAiCoachingConsent.mockResolvedValue({ ok: true });
    service.mockResolvedValue({ ok: true });

    await expect(call()).resolves.toEqual({ ok: true });
    expect(service).toHaveBeenCalledWith(
      ATHLETE,
      ...(service === startWeeklySession
        ? [expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 'da']
        : [
            CONVERSATION,
            'Tuesday is tight.',
            expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            'da',
          ]),
    );
  });

  it.each(cases)('%s refuses without consent, before the Coach is called', async (
    _name,
    call,
    service,
  ) => {
    resolveAthleteWithLanguage.mockResolvedValue({ ok: true, athlete: ATHLETE });
    assertAiCoachingConsent.mockResolvedValue({ ok: false });

    await expect(call()).resolves.toEqual({ ok: false, reason: 'consent-required' });
    expect(service).not.toHaveBeenCalled();
  });

  it.each(cases)('%s refuses a signed-out request without checking consent', async (
    _name,
    call,
    service,
  ) => {
    resolveAthleteWithLanguage.mockResolvedValue({
      ok: false,
      reason: 'not-authenticated',
    });

    await expect(call()).resolves.toEqual({ ok: false, reason: 'not-authenticated' });
    expect(assertAiCoachingConsent).not.toHaveBeenCalled();
    expect(service).not.toHaveBeenCalled();
  });
});

describe('commitWeeklyPlanAction', () => {
  it('writes the confirmed week and refreshes the calendar', async () => {
    resolveAthleteWithLanguage.mockResolvedValue({ ok: true, athlete: ATHLETE });
    commitWeeklyPlan.mockResolvedValue({ ok: true });

    const result = await commitWeeklyPlanAction(CONVERSATION);

    expect(result).toEqual({ ok: true });
    expect(commitWeeklyPlan).toHaveBeenCalledWith(
      ATHLETE,
      CONVERSATION,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(revalidatePath).toHaveBeenCalled();
  });

  it('refreshes nothing when the commit is refused', async () => {
    resolveAthleteWithLanguage.mockResolvedValue({ ok: true, athlete: ATHLETE });
    commitWeeklyPlan.mockResolvedValue({ ok: false, reason: 'no-proposal' });

    await commitWeeklyPlanAction(CONVERSATION);

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request', async () => {
    resolveAthleteWithLanguage.mockResolvedValue({
      ok: false,
      reason: 'not-authenticated',
    });

    await expect(commitWeeklyPlanAction(CONVERSATION)).resolves.toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(commitWeeklyPlan).not.toHaveBeenCalled();
  });
});

describe('declineWeeklyPlanAction', () => {
  it('cancels without writing or refreshing anything', async () => {
    resolveAthleteWithLanguage.mockResolvedValue({ ok: true, athlete: ATHLETE });
    declineWeeklyPlan.mockResolvedValue({ ok: true });

    const result = await declineWeeklyPlanAction(CONVERSATION);

    expect(result).toEqual({ ok: true });
    expect(declineWeeklyPlan).toHaveBeenCalledWith(ATHLETE, CONVERSATION);
    // Nothing changed in the plan, so nothing needs re-rendering.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request', async () => {
    resolveAthleteWithLanguage.mockResolvedValue({
      ok: false,
      reason: 'not-authenticated',
    });

    await expect(declineWeeklyPlanAction(CONVERSATION)).resolves.toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(declineWeeklyPlan).not.toHaveBeenCalled();
  });
});
