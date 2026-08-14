import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  redirect,
  getAthleteByUserId,
  getOpenConversations,
  getMessages,
  getPendingProposal,
  hasHeldWeeklySessionInWeek,
  shouldOfferWeeklySession,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(() => {
    // The real next-intl redirect() throws to stop rendering; the mock does
    // too, so the layout cannot fall through to reading a null session.
    throw new Error('REDIRECT');
  }),
  getAthleteByUserId: vi.fn(),
  // The Overlay is one surface across kinds (ADR 0007), so the layout resolves
  // whatever is open in one query and picks the kinds out of it, rather than
  // asking for 'weekly_session' by name.
  getOpenConversations: vi.fn((): Promise<Record<string, unknown>[]> => Promise.resolve([])),
  getMessages: vi.fn((): Promise<Record<string, unknown>[]> => Promise.resolve([])),
  getPendingProposal: vi.fn(() => Promise.resolve(null)),
  hasHeldWeeklySessionInWeek: vi.fn(() => Promise.resolve(false)),
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
  getOpenConversations,
  getMessages,
  hasHeldWeeklySessionInWeek,
}));
vi.mock('@/features/coach/plan-proposal-repository', () => ({ getPendingProposal }));
vi.mock('@/features/coach/coach-chat-service', () => ({ shouldOfferWeeklySession }));
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
    getOpenConversations.mockReset();
    getOpenConversations.mockResolvedValue([]);
    getMessages.mockReset();
    getMessages.mockResolvedValue([]);
    hasHeldWeeklySessionInWeek.mockClear();
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
    getOpenConversations.mockResolvedValue([
      { id: 'conv_1', kind: 'weekly_session', weeklySessionNumber: 3 },
    ]);
    getMessages.mockResolvedValue([
      { id: 'm1', role: 'athlete', content: 'hi', seq: 1 },
    ]);

    await render();

    expect(getOpenConversations).toHaveBeenCalledWith('athlete_1');
    expect(getMessages).toHaveBeenCalledWith('conv_1');
  });

  it("resumes the athlete's Coach Chat — the overlay's baseline mode", async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null });
    getOpenConversations.mockResolvedValue([{ id: 'chat_1', kind: 'coach_chat' }]);

    await render();

    expect(getMessages).toHaveBeenCalledWith('chat_1');
  });

  it('picks both kinds out of one open-conversation query', async () => {
    // The seam issue 01 asks for: resolved across kinds, not by naming one. A
    // resting Coach Chat and an in-progress Weekly Session are open at once.
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null });
    getOpenConversations.mockResolvedValue([
      { id: 'conv_1', kind: 'weekly_session', weeklySessionNumber: 2 },
      { id: 'chat_1', kind: 'coach_chat' },
    ]);

    await render();

    expect(getOpenConversations).toHaveBeenCalledTimes(1);
    expect(getMessages).toHaveBeenCalledWith('conv_1');
    expect(getMessages).toHaveBeenCalledWith('chat_1');
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
    await render();

    expect(hasHeldWeeklySessionInWeek).toHaveBeenCalledWith('athlete_1', expect.any(String));
    expect(shouldOfferWeeklySession).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklySessionDay: 'Monday',
        hasHeldWeeklySessionThisWeek: false,
      }),
    );
  });
});
