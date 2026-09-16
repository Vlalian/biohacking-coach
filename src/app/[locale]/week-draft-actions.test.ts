import { describe, it, expect, vi, beforeEach } from 'vitest';

const { currentAthlete, assertAiCoachingConsent, acceptWeekDraft, declineWeekDraft, discussWeekDraft, revalidatePath } = vi.hoisted(
  () => ({
    currentAthlete: vi.fn(),
    assertAiCoachingConsent: vi.fn(),
    acceptWeekDraft: vi.fn(),
    declineWeekDraft: vi.fn(),
    discussWeekDraft: vi.fn(),
    revalidatePath: vi.fn(),
  }),
);

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteWithLanguage: currentAthlete }));
vi.mock('@/features/consent/consent-gate', () => ({ assertAiCoachingConsent }));
vi.mock('@/features/coach/week-draft-decision-service', () => ({ acceptWeekDraft, declineWeekDraft, discussWeekDraft }));

const { acceptWeekDraftAction, declineWeekDraftAction, discussWeekDraftAction } = await import('./week-draft-actions');

/**
 * `training-architecture/18` — the athlete's three answers to a drafted week.
 * The athlete comes from the session and never from the request; the draft id
 * is all the client sends; discuss is consent-gated like every path that opens
 * a conversation with the Coach.
 */
const ATHLETE = { id: 'athlete_1', profile: {} };
const TODAY = /^\d{4}-\d{2}-\d{2}$/;

beforeEach(() => {
  vi.clearAllMocks();
  currentAthlete.mockResolvedValue({ ok: true, athlete: ATHLETE, language: 'da' });
  assertAiCoachingConsent.mockResolvedValue({ ok: true });
  acceptWeekDraft.mockResolvedValue({ ok: true, written: 3, pastDays: 0, start: '2026-09-21', end: '2026-09-27' });
  declineWeekDraft.mockResolvedValue({ ok: true });
  discussWeekDraft.mockResolvedValue({ ok: true, conversationId: 'c1', weeklySessionNumber: 2, messages: [], proposal: { sessions: [] }, endedAt: null });
});

describe('the three actions resolve the athlete from the session and take only a draft id', () => {
  it('accept: acts as the resolved athlete against the server clock, and refreshes the calendar', async () => {
    expect(await acceptWeekDraftAction('d1')).toMatchObject({ ok: true, written: 3 });
    expect(acceptWeekDraft).toHaveBeenCalledWith(ATHLETE, 'd1', expect.stringMatching(TODAY));
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('decline: likewise, refreshing so the card goes', async () => {
    expect(await declineWeekDraftAction('d1')).toEqual({ ok: true });
    expect(declineWeekDraft).toHaveBeenCalledWith(ATHLETE, 'd1', expect.stringMatching(TODAY));
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('discuss: passes the athlete’s language, and refreshes so the card becomes a pointer', async () => {
    expect(await discussWeekDraftAction('d1')).toMatchObject({ ok: true, conversationId: 'c1' });
    expect(discussWeekDraft).toHaveBeenCalledWith(ATHLETE, 'd1', expect.stringMatching(TODAY), 'da');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('every one refuses a signed-out caller before touching the service', async () => {
    currentAthlete.mockResolvedValue({ ok: false, reason: 'not-authenticated' });
    expect(await acceptWeekDraftAction('d1')).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(await declineWeekDraftAction('d1')).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(await discussWeekDraftAction('d1')).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(acceptWeekDraft).not.toHaveBeenCalled();
    expect(declineWeekDraft).not.toHaveBeenCalled();
    expect(discussWeekDraft).not.toHaveBeenCalled();
  });

  it('discuss refuses consent-required without AI consent; accept and decline need none', async () => {
    assertAiCoachingConsent.mockResolvedValue({ ok: false, missing: ['ai_coaching'] });
    expect(await discussWeekDraftAction('d1')).toEqual({ ok: false, reason: 'consent-required' });
    expect(discussWeekDraft).not.toHaveBeenCalled();
    expect(await acceptWeekDraftAction('d1')).toMatchObject({ ok: true });
    expect(await declineWeekDraftAction('d1')).toEqual({ ok: true });
  });

  it('a refusal from the service passes through and revalidates nothing', async () => {
    acceptWeekDraft.mockResolvedValue({ ok: false, reason: 'not-found' });
    expect(await acceptWeekDraftAction('d1')).toEqual({ ok: false, reason: 'not-found' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
