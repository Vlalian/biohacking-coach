import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  redirect,
  getAthleteByUserId,
  getOpenConversations,
  getMessages,
  getPendingProposal,
  getRatingsForConversation,
  hasHeldWeeklySessionInWeek,
  narratePendingEvents,
  holdsActiveCoachingLinks,
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
  getRatingsForConversation: vi.fn(() => Promise.resolve({})),
  hasHeldWeeklySessionInWeek: vi.fn(() => Promise.resolve(false)),
  // Narration has its own tests; here the layout's job is only to run it, with
  // the athlete's id, before the transcript is read.
  narratePendingEvents:
    vi.fn<(athleteId: string, ...rest: unknown[]) => Promise<void>>(),
  holdsActiveCoachingLinks: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
// `after()` is captured, never run: the draft must be reachable only through
// it, and a page test that ran it would be the render-path call this forbids.
const afterCallbacks: Array<() => Promise<void>> = [];
vi.mock('next/server', () => ({ after: (cb: () => Promise<void>) => afterCallbacks.push(cb) }));
const ensureWeekDrafted = vi.fn(() => Promise.resolve('drafted'));
vi.mock('@/features/coach/week-draft-service', () => ({ ensureWeekDrafted }));
vi.mock('@/i18n/navigation', () => ({ redirect, Link: () => null }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
vi.mock('@/features/coach/conversation-repository', () => ({
  getOpenConversations,
  getMessages,
  hasHeldWeeklySessionInWeek,
}));
vi.mock('@/features/coach/plan-proposal-repository', () => ({ getPendingProposal }));
vi.mock('@/features/feedback/message-feedback-repository', () => ({
  getRatingsForConversation,
}));
vi.mock('@/features/coach/narration-service', () => ({ narratePendingEvents }));
vi.mock('@/features/coach/coach-repository', () => ({ holdsActiveCoachingLinks }));
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
    narratePendingEvents.mockReset();
    narratePendingEvents.mockResolvedValue(undefined);
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

  it('hands the nudge inputs down without deciding the day itself', async () => {
    // ADR 0007's single sanctioned nudge, split deliberately: the server answers
    // what it knows (the stored day, whether a session was held) and stops. The
    // weekday is resolved in the browser, because the profile stores no timezone
    // — deciding it here would read the server's clock and nudge on the wrong
    // local day near midnight. So the layout must pass inputs, not a verdict.
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      syntheticLabel: null,
      profile: { weeklySessionDay: 'Monday' },
    });
    const element = await render();

    expect(hasHeldWeeklySessionInWeek).toHaveBeenCalledWith('athlete_1', expect.any(String));

    const props = (element as unknown as { props: Record<string, unknown> }).props;
    const coachContent = props.coachContent as { props: Record<string, unknown> };
    expect(coachContent.props.weeklyOffer).toEqual({
      weeklySessionDay: 'Monday',
      hasHeldWeeklySessionThisWeek: false,
    });
  });

  it('narrates pending Head Coach actions before it reads the transcript', async () => {
    // Order is the point, not merely that it runs: narration appends into the
    // Coach Chat, so reading the transcript first would show the athlete a
    // thread missing the message that was just written for them, until they
    // navigated again (ADR 0003, `coached-mode/03`).
    const callOrder: string[] = [];
    narratePendingEvents.mockImplementation(async () => {
      callOrder.push('narrate');
    });
    getOpenConversations.mockImplementation(async () => {
      callOrder.push('read');
      return [];
    });
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null });

    await render('en');

    expect(narratePendingEvents).toHaveBeenCalledTimes(1);
    expect(narratePendingEvents.mock.calls[0][0]).toBe('athlete_1');
    expect(callOrder).toEqual(['narrate', 'read']);
  });

  it('does not narrate for a user with no athlete row', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue(null);

    await render('en');

    expect(narratePendingEvents).not.toHaveBeenCalled();
  });
});

describe('the Roster entry in the Navigation Drawer', () => {
  // Head Coach is a role on a normal account (CONTEXT.md), so the entry cannot
  // be a module constant — which is why it was missing entirely until
  // 2026-08-21: the coach's pages worked and nothing ever linked to them.
  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: 'u1', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'a1', profile: {} });
  });

  async function viewsFor(isHeadCoach: boolean) {
    holdsActiveCoachingLinks.mockResolvedValue(isHeadCoach);
    const element = await render();
    const props = (element as unknown as { props: Record<string, unknown> }).props;
    return props.availableViews as string[];
  }

  it('is offered to an account holding active Coaching Links', async () => {
    expect(await viewsFor(true)).toContain('roster');
  });

  it('is withheld from an account holding none', async () => {
    expect(await viewsFor(false)).not.toContain('roster');
  });

  it('never costs a Head Coach their own athlete Views', async () => {
    // The dual-role case the seed actually creates: a coach row alongside an
    // athlete row. Their own training is still why they open the app.
    const views = await viewsFor(true);
    for (const view of ['training-plan', 'information', 'equipment', 'settings', 'privacy']) {
      expect(views).toContain(view);
    }
  });
});

describe('the weekly offer keys on the conversation, never on the plan', () => {
  // `coach-overlay/04` decision 4, pinned for `training-architecture/07` and
  // `/16`: a drafted week must still be offered, so the layout may derive
  // `hasHeldWeeklySessionThisWeek` from held conversations only. A plan read
  // here would be the exact regression — generation silencing its own offer.
  it('the layout reads no sessions and no plan to decide the nudge', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(fileURLToPath(new URL('./layout.tsx', import.meta.url)), 'utf8');
    expect(source).toContain('hasHeldWeeklySessionInWeek');
    // Every seam a plan or a drafted week could be read through, by name.
    expect(source).not.toMatch(
      /session-repository|getSessionsFor|hasCoachPlanForWeek|replaceCoachPlan|getResolvedBlocks|getBlockSet|training-block|plan-proposal-repository'\)[^]*?weeklyOffer/,
    );
  });

  // The runtime half. The layout can see two things that resemble "this week
  // has a plan": a pending proposal and a held Weekly Session. The offer must
  // follow the second and ignore the first — and the previous version of this
  // test set up neither, so it asserted the default and could not fail (review
  // of 07, 2026-09-15).
  const weeklyOfferOf = async () => {
    const element = await render();
    const props = (element as unknown as { props: Record<string, unknown> }).props;
    return (props.coachContent as { props: Record<string, unknown> }).props.weeklyOffer;
  };

  it('derives the offer from the held-session read for this week, and from nothing else', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      syntheticLabel: null,
      profile: { weeklySessionDay: 'Monday' },
    });
    hasHeldWeeklySessionInWeek.mockResolvedValue(false);
    getPendingProposal.mockClear();

    expect(await weeklyOfferOf()).toEqual({ weeklySessionDay: 'Monday', hasHeldWeeklySessionThisWeek: false });
    expect(hasHeldWeeklySessionInWeek).toHaveBeenCalledWith('athlete_1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    // No open Weekly Session, so the proposal — the only plan-shaped thing in
    // reach — is never even read on the way to the offer.
    expect(getPendingProposal).not.toHaveBeenCalled();
  });

  it('withdraws the offer only when this week\'s session was actually held', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      syntheticLabel: null,
      profile: { weeklySessionDay: 'Monday' },
    });
    hasHeldWeeklySessionInWeek.mockResolvedValue(true);

    expect(await weeklyOfferOf()).toEqual({ weeklySessionDay: 'Monday', hasHeldWeeklySessionThisWeek: true });
  });
});

describe('the silent week draft runs after the response, never in it (training-architecture/16)', () => {
  beforeEach(() => {
    afterCallbacks.length = 0;
    ensureWeekDrafted.mockClear();
  });

  it('schedules ensureWeekDrafted through after() for a signed-in athlete, and does not call it during render', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null, profile: {} });
    await render();
    expect(ensureWeekDrafted).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(ensureWeekDrafted).toHaveBeenCalledWith('athlete_1', expect.any(String));
  });

  it('a throw inside the deferred call is logged, not rethrown', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null, profile: {} });
    ensureWeekDrafted.mockRejectedValueOnce(new Error('driver down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await render();
    await expect(afterCallbacks[0]()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('schedules nothing for a user with no athlete row', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue(undefined);
    await render();
    expect(afterCallbacks).toHaveLength(0);
  });
});
