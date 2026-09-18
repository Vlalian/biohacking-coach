import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  currentAthlete,
  saveCheckIn,
  assertAiCoachingConsent,
  startWeeklySession,
  continueWeeklySession,
  commitWeeklyPlan,
  declineWeeklyPlan,
  revalidatePath,
} = vi.hoisted(() => ({
  currentAthlete: vi.fn(),
  assertAiCoachingConsent: vi.fn<() => Promise<{ ok: boolean }>>(async () => ({ ok: true })),
  startWeeklySession: vi.fn<() => Promise<unknown>>(async () => ({ ok: true })),
  continueWeeklySession: vi.fn<() => Promise<unknown>>(async () => ({ ok: true })),
  commitWeeklyPlan: vi.fn<() => Promise<{ ok: boolean; reason?: string }>>(async () => ({
    ok: true,
  })),
  declineWeeklyPlan: vi.fn<() => Promise<unknown>>(async () => ({ ok: true })),
  revalidatePath: vi.fn(),
  saveCheckIn: vi.fn<
    (
      athleteId: string,
      weekStart: string,
      report: { energy: number; body: number; sleepQuality: number; notableSignal: string | null },
    ) => Promise<void>
  >(async () => undefined),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/features/consent/consent-gate', () => ({ assertAiCoachingConsent }));
vi.mock('@/features/coach/check-in-repository', () => ({ saveCheckIn }));
vi.mock('./current-actor', () => ({ resolveAthleteWithLanguage: currentAthlete }));
vi.mock('@/features/coach/weekly-session-service', () => ({
  commitWeeklyPlan,
  continueWeeklySession,
  declineWeeklyPlan,
  startWeeklySession,
}));

const {
  saveCheckInAction,
  startWeeklySessionAction,
  sendWeeklyMessageAction,
  commitWeeklyPlanAction,
} = await import('./weekly-actions');

const REPORT = { energy: 6, body: 7, sleepQuality: 5, notableSignal: null };

beforeEach(() => {
  vi.clearAllMocks();
  currentAthlete.mockResolvedValue({
    ok: true,
    athlete: { id: 'athlete_1' },
    language: 'en',
    preferredName: 'Mads',
  });
  assertAiCoachingConsent.mockResolvedValue({ ok: true });
  commitWeeklyPlan.mockResolvedValue({ ok: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-10T09:00:00Z')); // a Thursday
});

/**
 * `training-architecture/05`. The action's whole job is to say **who** is asking
 * and **which week** it is — the repository decides what a valid report is, and
 * has its own tests for that.
 */
describe('saveCheckInAction', () => {
  it('files the report against the Monday of this week', async () => {
    // Once per week, not daily (CONTEXT.md). Filed on a Thursday it still
    // belongs to Monday — storing it under Thursday would let one athlete file
    // seven Check-ins in a week, each looking perfectly valid.
    await expect(saveCheckInAction(REPORT)).resolves.toEqual({ ok: true });

    expect(saveCheckIn).toHaveBeenCalledWith('athlete_1', '2026-09-07', {
      energy: 6,
      body: 7,
      sleepQuality: 5,
      notableSignal: null,
    });
  });

  it('refuses a caller it cannot identify, and writes nothing', async () => {
    currentAthlete.mockResolvedValue({ ok: false, reason: 'not-authenticated' });

    await expect(saveCheckInAction(REPORT)).resolves.toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(saveCheckIn).not.toHaveBeenCalled();
  });

  it('is deliberately not gated on AI consent', async () => {
    // Filing a Check-in sends nothing anywhere. It reaches a prompt only when a
    // Weekly Session starts, and that path has its own gate. Refusing to let an
    // athlete record how they feel — because of a consent covering something
    // they have not done — would be the gate doing a job that is not its own.
    await saveCheckInAction(REPORT);

    expect(assertAiCoachingConsent).not.toHaveBeenCalled();
  });

  it('surfaces a refusal rather than throwing when the report is invalid', async () => {
    // The repository is what judges the scores. The athlete sees a refusal, not
    // a 500, and nothing is stored.
    saveCheckIn.mockRejectedValueOnce(new Error('Check-in is not complete'));

    await expect(saveCheckInAction({ ...REPORT, energy: 99 })).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
  });
});

describe('the notable signal, on its way to a prompt', () => {
  it('trims it, and stores nothing rather than an empty string', async () => {
    // An empty string would render in the prompt as a signal the athlete gave.
    // Absence is the honest value for "they wrote nothing".
    await saveCheckInAction({ ...REPORT, notableSignal: '   ' });

    expect(saveCheckIn).toHaveBeenCalledWith(
      'athlete_1',
      '2026-09-07',
      expect.objectContaining({ notableSignal: null }),
    );
  });

  it('keeps what the athlete actually wrote', async () => {
    await saveCheckInAction({ ...REPORT, notableSignal: '  legs heavy after Tuesday  ' });

    expect(saveCheckIn).toHaveBeenCalledWith(
      'athlete_1',
      '2026-09-07',
      expect.objectContaining({ notableSignal: 'legs heavy after Tuesday' }),
    );
  });

  it('caps it, because it reaches the model verbatim', async () => {
    await saveCheckInAction({ ...REPORT, notableSignal: 'x'.repeat(900) });

    expect(saveCheckIn.mock.calls[0][2].notableSignal).toHaveLength(500);
  });

  it('refuses a signal that is not text, rather than throwing on it', async () => {
    // CodeRabbit on PR #60. A server action's payload is typed only by
    // assertion; a number here reached `.trim()` and threw a TypeError, which
    // the catch below rethrew as "not the athlete's problem" — straight to the
    // error boundary, form and all. It is the athlete's problem, and they get
    // told so the same way a score outside 1-10 tells them.
    const result = await saveCheckInAction({
      ...REPORT,
      notableSignal: 42 as unknown as string,
    });

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(saveCheckIn).not.toHaveBeenCalled();
  });
});

/**
 * The three actions that make the Coach process the athlete's data.
 *
 * These pre-date `training-architecture/05` and had no tests at all — the file
 * had none, so the whole server surface of the Weekly Session sat at 0%
 * coverage. Covered here because this slice built the harness for it, and
 * because these are where the consent gate is actually enforced: a gate nothing
 * exercises is a gate nobody knows still works.
 */
describe('the actions that reach the Coach are gated on consent', () => {
  it('starts a Weekly Session for a consenting athlete, with today and their language', async () => {
    startWeeklySession.mockResolvedValue({ ok: true });

    await expect(startWeeklySessionAction()).resolves.toEqual({ ok: true });

    expect(startWeeklySession).toHaveBeenCalledWith({ id: 'athlete_1' }, '2026-09-10', 'en', {
      preferredName: 'Mads',
    });
  });

  it.each([
    ['startWeeklySessionAction', () => startWeeklySessionAction()],
    ['sendWeeklyMessageAction', () => sendWeeklyMessageAction('conv_1', 'hello')],
  ])('refuses %s without current consent, before any prompt is assembled', async (_name, call) => {
    assertAiCoachingConsent.mockResolvedValue({ ok: false });

    await expect(call()).resolves.toEqual({ ok: false, reason: 'consent-required' });
    expect(startWeeklySession).not.toHaveBeenCalled();
    expect(continueWeeklySession).not.toHaveBeenCalled();
  });

  it.each([
    ['startWeeklySessionAction', () => startWeeklySessionAction()],
    ['sendWeeklyMessageAction', () => sendWeeklyMessageAction('conv_1', 'hello')],
    ['commitWeeklyPlanAction', () => commitWeeklyPlanAction('conv_1')],
  ])('refuses %s when nobody is signed in', async (_name, call) => {
    currentAthlete.mockResolvedValue({ ok: false, reason: 'not-authenticated' });

    await expect(call()).resolves.toEqual({ ok: false, reason: 'not-authenticated' });
    expect(assertAiCoachingConsent).not.toHaveBeenCalled();
  });

  it('passes the athlete turn on with today and their language', async () => {
    continueWeeklySession.mockResolvedValue({ ok: true });

    await sendWeeklyMessageAction('conv_1', 'how should I pace Sunday?');

    expect(continueWeeklySession).toHaveBeenCalledWith(
      { id: 'athlete_1' },
      'conv_1',
      'how should I pace Sunday?',
      '2026-09-10',
      'en',
      'Mads',
    );
  });

  it('passes null, not undefined, when the athlete chose no Preferred Name', async () => {
    currentAthlete.mockResolvedValue({ ok: true, athlete: { id: 'athlete_1' }, language: 'en' });
    startWeeklySession.mockResolvedValue({ ok: true });
    continueWeeklySession.mockResolvedValue({ ok: true });

    await startWeeklySessionAction();
    await sendWeeklyMessageAction('conv_1', 'hello');

    expect(startWeeklySession).toHaveBeenCalledWith({ id: 'athlete_1' }, '2026-09-10', 'en', {
      preferredName: null,
    });
    expect((continueWeeklySession.mock.calls[0] as unknown[])[5]).toBeNull();
  });
});

describe('committing a plan refreshes the calendar, and only when it landed', () => {
  it('revalidates after a plan is written', async () => {
    // The confirmed week has to appear in the calendar. Without this the athlete
    // agrees to a plan and sees the old one.
    commitWeeklyPlan.mockResolvedValue({ ok: true });

    await commitWeeklyPlanAction('conv_1');

    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('does not revalidate when the commit refused', async () => {
    // Nothing changed, so nothing to refresh — and a revalidate here would
    // suggest to the athlete that something had.
    commitWeeklyPlan.mockResolvedValue({ ok: false, reason: 'stale' });

    await commitWeeklyPlanAction('conv_1');

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
