import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveHeadCoachId, setWeeklySessionDayAsHeadCoach, approveWeekDraft, revalidatePath } = vi.hoisted(() => ({
  resolveHeadCoachId: vi.fn(),
  setWeeklySessionDayAsHeadCoach: vi.fn(),
  approveWeekDraft: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../../current-actor', () => ({ resolveHeadCoachId }));
vi.mock('@/features/coach/head-coach-week-service', () => ({ setWeeklySessionDayAsHeadCoach, approveWeekDraft }));

const { setWeeklySessionDayAction } = await import('./day-actions');
const { approveWeekDraftAction } = await import('./week-draft-actions');

/**
 * `training-architecture/17` — the two actions by which a Head Coach reaches a
 * linked athlete's week and its day. The link gate and the validation live in
 * the service and are tested there. Asserted here: the acting coach comes from
 * the session, `today` is the server's, and revalidation is layout-scoped and
 * only on success.
 */
const COACH = 'coach_1';
const ATHLETE = 'athlete_1';
const SESSIONS = [{ date: '2026-09-22', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: null }];

beforeEach(() => {
  vi.clearAllMocks();
  resolveHeadCoachId.mockResolvedValue(COACH);
  setWeeklySessionDayAsHeadCoach.mockResolvedValue({ ok: true });
  approveWeekDraft.mockResolvedValue({ ok: true, changed: false });
});

describe('setWeeklySessionDayAction', () => {
  it('sets the day as the resolved coach and revalidates the athlete layout', async () => {
    expect(await setWeeklySessionDayAction(ATHLETE, 'Sunday')).toEqual({ ok: true });
    expect(setWeeklySessionDayAsHeadCoach).toHaveBeenCalledWith({ headCoachId: COACH, athleteId: ATHLETE, day: 'Sunday' });
    expect(revalidatePath).toHaveBeenCalledWith(`/coach/athlete/${ATHLETE}`, 'layout');
  });

  it('refuses a caller with no coach row, touching nothing', async () => {
    resolveHeadCoachId.mockResolvedValue(null);
    expect(await setWeeklySessionDayAction(ATHLETE, 'Sunday')).toEqual({ ok: false, reason: 'not-a-coach' });
    expect(setWeeklySessionDayAsHeadCoach).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('passes a refusal through and revalidates nothing', async () => {
    setWeeklySessionDayAsHeadCoach.mockResolvedValue({ ok: false, reason: 'not-linked' });
    expect(await setWeeklySessionDayAction(ATHLETE, 'Sunday')).toEqual({ ok: false, reason: 'not-linked' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('approveWeekDraftAction', () => {
  it('approves as the resolved coach, against the server clock, and revalidates the layout', async () => {
    expect(await approveWeekDraftAction(ATHLETE, 'd1', '2026-09-21', SESSIONS)).toEqual({ ok: true, changed: false });
    expect(approveWeekDraft).toHaveBeenCalledWith({
      headCoachId: COACH,
      athleteId: ATHLETE,
      draftId: 'd1',
      weekStart: '2026-09-21',
      sessions: SESSIONS,
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/coach/athlete/${ATHLETE}`, 'layout');
  });

  it('refuses a caller with no coach row, touching nothing', async () => {
    resolveHeadCoachId.mockResolvedValue(null);
    expect(await approveWeekDraftAction(ATHLETE, 'd1', '2026-09-21', SESSIONS)).toEqual({ ok: false, reason: 'not-a-coach' });
    expect(approveWeekDraft).not.toHaveBeenCalled();
  });

  it('passes stale and invalid through, revalidating nothing', async () => {
    for (const reason of ['stale', 'invalid', 'not-linked'] as const) {
      approveWeekDraft.mockResolvedValue({ ok: false, reason });
      expect(await approveWeekDraftAction(ATHLETE, 'd1', '2026-09-21', SESSIONS)).toEqual({ ok: false, reason });
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
