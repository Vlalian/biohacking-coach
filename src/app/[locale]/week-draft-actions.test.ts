import { describe, it, expect, vi, beforeEach } from 'vitest';

const { currentAthlete, assertAiCoachingConsent, acceptWeekDraft, declineWeekDraft, discussWeekDraft, redraftWeek, draftLanded, revalidatePath } = vi.hoisted(
  () => ({
    currentAthlete: vi.fn(),
    assertAiCoachingConsent: vi.fn(),
    acceptWeekDraft: vi.fn(),
    declineWeekDraft: vi.fn(),
    discussWeekDraft: vi.fn(),
    redraftWeek: vi.fn(),
    draftLanded: vi.fn(),
    revalidatePath: vi.fn(),
  }),
);

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteWithLanguage: currentAthlete }));
vi.mock('@/features/consent/consent-gate', () => ({ assertAiCoachingConsent }));
vi.mock('@/features/coach/week-draft-decision-service', () => ({ acceptWeekDraft, declineWeekDraft, discussWeekDraft }));
vi.mock('@/features/coach/week-draft-service', () => ({ redraftWeek, draftLanded }));

const { acceptWeekDraftAction, declineWeekDraftAction, discussWeekDraftAction, redraftWeekAction, draftLandedAction } =
  await import('./week-draft-actions');

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
  discussWeekDraft.mockResolvedValue({ ok: true, conversationId: 'c1', messages: [], proposal: { sessions: [] } });
});

describe('the three actions resolve the athlete from the session and take only a draft id', () => {
  it('accept: acts as the resolved athlete against the server clock, and refreshes the calendar', async () => {
    expect(await acceptWeekDraftAction('d1')).toMatchObject({ ok: true, written: 3 });
    expect(acceptWeekDraft).toHaveBeenCalledWith(ATHLETE, 'd1', expect.stringMatching(TODAY));
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('decline: passes on the one reason the athlete chose, and nothing when they skipped (training-architecture/30)', async () => {
    await declineWeekDraftAction('d1', 'wrong-days');
    expect(declineWeekDraft).toHaveBeenCalledWith(ATHLETE, 'd1', expect.stringMatching(TODAY), 'wrong-days');
    await declineWeekDraftAction('d1');
    expect(declineWeekDraft).toHaveBeenLastCalledWith(ATHLETE, 'd1', expect.stringMatching(TODAY), undefined);
  });

  it('decline: likewise, refreshing so the card goes', async () => {
    expect(await declineWeekDraftAction('d1')).toEqual({ ok: true });
    // The fourth argument is the decline reason (training-architecture/30): none here.
    expect(declineWeekDraft).toHaveBeenCalledWith(ATHLETE, 'd1', expect.stringMatching(TODAY), undefined);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('discuss: hands back the chat to open, and refreshes so the card becomes a pointer', async () => {
    expect(await discussWeekDraftAction('d1')).toEqual({ ok: true, conversationId: 'c1', messages: [], proposal: { sessions: [] } });
    expect(discussWeekDraft).toHaveBeenCalledWith(ATHLETE, 'd1', expect.stringMatching(TODAY));
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

  // training-architecture/24: the one way a week is drafted twice.
  it('redraft: acts as the resolved athlete for the named week against the server clock, consent-gated, and refreshes on a draft', async () => {
    redraftWeek.mockResolvedValue('drafted');
    expect(await redraftWeekAction('2026-09-21')).toEqual({ ok: true, outcome: 'drafted' });
    expect(redraftWeek).toHaveBeenCalledWith(ATHLETE.id, '2026-09-21', expect.stringMatching(TODAY));
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('redraft: a refusal comes back as-is and refreshes nothing; a signed-out or unconsented caller never reaches the service', async () => {
    redraftWeek.mockResolvedValue('already-planned');
    expect(await redraftWeekAction('2026-09-21')).toEqual({ ok: false, reason: 'already-planned' });
    expect(revalidatePath).not.toHaveBeenCalled();
    assertAiCoachingConsent.mockResolvedValue({ ok: false, missing: ['ai_coaching'] });
    expect(await redraftWeekAction('2026-09-21')).toEqual({ ok: false, reason: 'consent-required' });
    currentAthlete.mockResolvedValue({ ok: false, reason: 'not-authenticated' });
    expect(await redraftWeekAction('2026-09-21')).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(redraftWeek).toHaveBeenCalledTimes(1);
  });

  it('a refusal from the service passes through and revalidates nothing — for all three', async () => {
    acceptWeekDraft.mockResolvedValue({ ok: false, reason: 'not-found' });
    declineWeekDraft.mockResolvedValue({ ok: false, reason: 'not-found' });
    discussWeekDraft.mockResolvedValue({ ok: false, reason: 'not-found' });
    expect(await acceptWeekDraftAction('d1')).toEqual({ ok: false, reason: 'not-found' });
    expect(await declineWeekDraftAction('d1')).toEqual({ ok: false, reason: 'not-found' });
    expect(await discussWeekDraftAction('d1')).toEqual({ ok: false, reason: 'not-found' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('draftLandedAction — the waiting card’s read (training-architecture/29, review)', () => {
  it('asks as the resolved athlete for the named week and revalidates nothing; a signed-out caller is told not yet', async () => {
    draftLanded.mockResolvedValue(true);
    expect(await draftLandedAction('2026-09-21')).toBe(true);
    expect(draftLanded).toHaveBeenCalledWith(ATHLETE.id, '2026-09-21');
    expect(revalidatePath).not.toHaveBeenCalled();
    currentAthlete.mockResolvedValue({ ok: false, reason: 'not-signed-in' });
    expect(await draftLandedAction('2026-09-21')).toBe(false);
    expect(draftLanded).toHaveBeenCalledTimes(1);
  });
});
