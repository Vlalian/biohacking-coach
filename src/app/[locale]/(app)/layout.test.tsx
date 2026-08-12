import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  redirect,
  getAthleteByUserId,
  getLatestOpenConversation,
  getMessages,
  getPendingProposal,
  getOpenCoachChat,
  hasCoachPlanForWeek,
  shouldOfferWeeklySession,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(() => {
    // The real next-intl redirect() throws to stop rendering; the mock does
    // too, so the layout cannot fall through to reading a null session.
    throw new Error('REDIRECT');
  }),
  getAthleteByUserId: vi.fn(),
  getLatestOpenConversation: vi.fn(),
  getMessages: vi.fn(),
  getPendingProposal: vi.fn(() => Promise.resolve(null)),
  // Coach Chat is the overlay's baseline mode (ADR 0007), so the layout now
  // also resumes the chat and decides the weekly offer. Both reach Postgres;
  // the layout's own wiring is what is under test, not the service.
  getOpenCoachChat: vi.fn(() => Promise.resolve(null)),
  hasCoachPlanForWeek: vi.fn(() => Promise.resolve(false)),
  shouldOfferWeeklySession: vi.fn(() => false),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/i18n/navigation', () => ({ redirect, Link: () => null }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
vi.mock('@/features/coach/conversation-repository', () => ({
  getLatestOpenConversation,
  getMessages,
}));
vi.mock('@/features/coach/plan-proposal-repository', () => ({ getPendingProposal }));
vi.mock('@/features/coach/coach-chat-service', () => ({
  getOpenCoachChat,
  hasCoachPlanForWeek,
  shouldOfferWeeklySession,
}));
// Client components pulling in browser deps; the layout's own wiring is under
// test here, not their rendering.
vi.mock('@/components/shell/shell-chrome', () => ({ ShellChrome: () => null }));
vi.mock('../coach-thread', () => ({ CoachThread: () => null }));

const { default: AppShellLayout } = await import('./layout');

function render(locale = 'en') {
  return AppShellLayout({
    children: null,
    params: Promise.resolve({ locale }),
  });
}

describe('AppShellLayout', () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
    getAthleteByUserId.mockReset();
    getLatestOpenConversation.mockReset();
    getMessages.mockReset();
    getOpenCoachChat.mockClear();
    hasCoachPlanForWeek.mockClear();
    shouldOfferWeeklySession.mockClear();
  });

  it('redirects a signed-out visitor to sign-in instead of rendering the shell', async () => {
    getSession.mockResolvedValue(null);

    await expect(render('da')).rejects.toThrow('REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/sign-in', locale: 'da' });
    expect(getAthleteByUserId).not.toHaveBeenCalled();
  });

  it('restores an in-progress Weekly Session for a signed-in athlete', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null });
    getLatestOpenConversation.mockResolvedValue({
      id: 'conv_1',
      weeklySessionNumber: 3,
    });
    getMessages.mockResolvedValue([
      { id: 'm1', role: 'athlete', content: 'hi', seq: 1 },
    ]);

    await render();

    expect(getLatestOpenConversation).toHaveBeenCalledWith('athlete_1', 'weekly_session');
    expect(getMessages).toHaveBeenCalledWith('conv_1');
  });

  it("resumes the athlete's Coach Chat — the overlay's baseline mode", async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null });
    getLatestOpenConversation.mockResolvedValue(null);

    await render();

    expect(getOpenCoachChat).toHaveBeenCalledWith('athlete_1');
  });

  it('decides the weekly offer from the stored Weekly Session Day', async () => {
    // ADR 0007's single sanctioned nudge. The layout must pass the athlete's own
    // stored day, not assume one — an athlete who never chose a day is never
    // nudged, and that decision is the service's to make from real inputs.
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      syntheticLabel: null,
      profile: { weeklySessionDay: 'Monday' },
    });
    getLatestOpenConversation.mockResolvedValue(null);

    await render();

    expect(hasCoachPlanForWeek).toHaveBeenCalledWith('athlete_1', expect.any(String));
    expect(shouldOfferWeeklySession).toHaveBeenCalledWith(
      expect.objectContaining({ weeklySessionDay: 'Monday', hasCoachPlannedThisWeek: false }),
    );
  });
});
