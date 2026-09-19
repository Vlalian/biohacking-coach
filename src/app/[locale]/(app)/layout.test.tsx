import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  redirect,
  getAthleteByUserId,
  getOpenConversations,
  getMessages,
  getPendingProposal,
  getRatingsForConversation,
  getCheckInForWeek,
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
  // This week's Check-in, or none: the server's half of the reminder decision.
  getCheckInForWeek: vi.fn((): Promise<Record<string, unknown> | null> => Promise.resolve(null)),
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
const ensureRosterDrafted = vi.fn(() => Promise.resolve({}));
vi.mock('@/features/coach/week-draft-service', () => ({ ensureWeekDrafted, ensureRosterDrafted }));
vi.mock('@/i18n/navigation', () => ({ redirect, Link: () => null }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
vi.mock('@/features/coach/conversation-repository', () => ({
  getOpenConversations,
  getMessages,
}));
vi.mock('@/features/coach/check-in-repository', () => ({ getCheckInForWeek }));
vi.mock('@/features/coach/plan-proposal-repository', () => ({ getPendingProposal }));
vi.mock('@/features/feedback/message-feedback-repository', () => ({
  getRatingsForConversation,
}));
vi.mock('@/features/coach/narration-service', () => ({ narratePendingEvents }));
vi.mock('@/features/coach/coach-repository', () => ({ holdsActiveCoachingLinks }));
// The chores read has its own tests; here the layout's job is to run it once,
// before render, and only for a linked coach (`training-architecture/19`).
const getCoachChores = vi.fn(() => Promise.resolve([] as unknown[]));
vi.mock('@/features/coach/coach-chores-service', () => ({ getCoachChores }));
const CoachChoresDialog = () => null;
vi.mock('./coach-chores-dialog', () => ({ CoachChoresDialog }));
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
    getCheckInForWeek.mockReset();
    getCheckInForWeek.mockResolvedValue(null);
    narratePendingEvents.mockReset();
    narratePendingEvents.mockResolvedValue(undefined);
  });

  it('redirects a signed-out visitor to sign-in instead of rendering the shell', async () => {
    getSession.mockResolvedValue(null);

    await expect(render('da')).rejects.toThrow('REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/sign-in', locale: 'da' });
    expect(getAthleteByUserId).not.toHaveBeenCalled();
  });

  it('leaves an old open Weekly Session where it is — there is no screen for it any more (training-architecture/21)', async () => {
    // The behavior is retired; the row stays for the transcript readers, and
    // the shell neither restores it nor reads its messages.
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null });
    getOpenConversations.mockResolvedValue([
      { id: 'conv_1', kind: 'weekly_session', weeklySessionNumber: 3 },
    ]);

    const element = await render();

    expect(getOpenConversations).toHaveBeenCalledWith('athlete_1');
    expect(getMessages).not.toHaveBeenCalled();
    const props = (element as unknown as { props: Record<string, unknown> }).props;
    const coachContent = props.coachContent as { props: Record<string, unknown> };
    expect(coachContent.props).not.toHaveProperty('weeklyInitial');
  });

  it("resumes the athlete's Coach Chat — the overlay's baseline mode", async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null });
    getOpenConversations.mockResolvedValue([{ id: 'chat_1', kind: 'coach_chat' }]);

    await render();

    expect(getMessages).toHaveBeenCalledWith('chat_1');
  });

  it('picks the chat out of one open-conversation query, beside an old Weekly Session', async () => {
    // The seam issue 01 asks for: resolved across kinds, not by naming one. A
    // resting Coach Chat and an old open `weekly_session` row can coexist.
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null });
    getOpenConversations.mockResolvedValue([
      { id: 'conv_1', kind: 'weekly_session', weeklySessionNumber: 2 },
      { id: 'chat_1', kind: 'coach_chat' },
    ]);

    await render();

    expect(getOpenConversations).toHaveBeenCalledTimes(1);
    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(getMessages).toHaveBeenCalledWith('chat_1');
  });

  it('hands the reminder inputs down without deciding the day itself', async () => {
    // ADR 0007's single sanctioned nudge, split deliberately: the server answers
    // what it knows (the stored day, whether a Check-in is filed) and stops. The
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

    expect(getCheckInForWeek).toHaveBeenCalledWith('athlete_1', expect.any(String));

    const props = (element as unknown as { props: Record<string, unknown> }).props;
    const coachContent = props.coachContent as { props: Record<string, unknown> };
    expect(coachContent.props.checkInOffer).toEqual({
      weeklySessionDay: 'Monday',
      hasCheckedInThisWeek: false,
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
    for (const view of ['training-plan', 'information', 'equipment', 'glossary', 'settings', 'privacy']) {
      expect(views).toContain(view);
    }
  });
});

describe('the Check-in reminder keys on the Check-in, never on the plan', () => {
  // `coach-overlay/04` decision 4, carried over when the nudge became the
  // Check-in reminder (`training-architecture/21`): a drafted week must still
  // be asked about, so the layout may derive `hasCheckedInThisWeek` from the
  // Check-in row only. A plan read here would be the exact regression —
  // generation silencing its own reminder.
  it('the layout reads no sessions and no plan to decide the reminder', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(fileURLToPath(new URL('./layout.tsx', import.meta.url)), 'utf8');
    expect(source).toContain('getCheckInForWeek');
    // Every seam a plan or a drafted week could be read through, by name.
    expect(source).not.toMatch(
      /session-repository|getSessionsFor|hasCoachPlanForWeek|replaceCoachPlan|getResolvedBlocks|getBlockSet|training-block|plan-proposal-repository'\)[^]*?checkInOffer/,
    );
  });

  const checkInOfferOf = async () => {
    const element = await render();
    const props = (element as unknown as { props: Record<string, unknown> }).props;
    return (props.coachContent as { props: Record<string, unknown> }).props.checkInOffer;
  };

  it('derives the reminder from this week\'s Check-in read, and from nothing else', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      syntheticLabel: null,
      profile: { weeklySessionDay: 'Monday' },
    });
    getCheckInForWeek.mockResolvedValue(null);
    getPendingProposal.mockClear();

    expect(await checkInOfferOf()).toEqual({ weeklySessionDay: 'Monday', hasCheckedInThisWeek: false });
    expect(getCheckInForWeek).toHaveBeenCalledWith('athlete_1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    // The proposal — the only plan-shaped thing in reach — is never read on
    // the way to the reminder.
    expect(getPendingProposal).not.toHaveBeenCalled();
  });

  it('withdraws the reminder only when this week\'s Check-in is actually filed', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({
      id: 'athlete_1',
      syntheticLabel: null,
      profile: { weeklySessionDay: 'Monday' },
    });
    getCheckInForWeek.mockResolvedValue({ id: 'ci_1', weekStart: '2026-09-14', energy: 6, body: 6, sleepQuality: 6 });

    expect(await checkInOfferOf()).toEqual({ weeklySessionDay: 'Monday', hasCheckedInThisWeek: true });
  });
});

describe('the silent week draft runs after the response, never in it (training-architecture/16)', () => {
  beforeEach(() => {
    afterCallbacks.length = 0;
    ensureWeekDrafted.mockClear();
    ensureRosterDrafted.mockClear();
    holdsActiveCoachingLinks.mockResolvedValue(false);
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

  it('schedules nothing for a user with no athlete row and no roster', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue(undefined);
    await render();
    expect(afterCallbacks).toHaveLength(0);
  });

  // 16: "whoever opens the app first on or after the due day triggers it, coach
  // or athlete." 17's day-early preview depends on it: the coach sees the draft
  // on a day the athlete has no reason to open the app.
  it('schedules the roster-wide draft for a Head Coach who is not an athlete, keyed on their user id', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_coach', name: 'Lars' } });
    getAthleteByUserId.mockResolvedValue(undefined);
    holdsActiveCoachingLinks.mockResolvedValue(true);
    await render();
    expect(ensureRosterDrafted).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(ensureRosterDrafted).toHaveBeenCalledWith('user_coach', expect.any(String));
    expect(ensureWeekDrafted).not.toHaveBeenCalled();
  });

  it('schedules both for a Head Coach who is also an athlete — their own draft and their roster’s', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_both', name: 'Mads' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null, profile: {} });
    holdsActiveCoachingLinks.mockResolvedValue(true);
    await render();
    expect(afterCallbacks).toHaveLength(2);
    for (const cb of afterCallbacks) await cb();
    expect(ensureWeekDrafted).toHaveBeenCalledWith('athlete_1', expect.any(String));
    expect(ensureRosterDrafted).toHaveBeenCalledWith('user_both', expect.any(String));
  });

  it('a throw inside the roster call is logged, not rethrown', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_coach', name: 'Lars' } });
    getAthleteByUserId.mockResolvedValue(undefined);
    holdsActiveCoachingLinks.mockResolvedValue(true);
    ensureRosterDrafted.mockRejectedValueOnce(new Error('driver down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await render();
    await expect(afterCallbacks[0]()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('the Head Coach’s chores are read before render, once, and only for linked coaches (training-architecture/19)', () => {
  beforeEach(() => {
    afterCallbacks.length = 0;
    getCoachChores.mockClear();
    getCoachChores.mockResolvedValue([]);
    getSession.mockResolvedValue({ user: { id: 'user_coach', name: 'Lars' } });
    getAthleteByUserId.mockResolvedValue(undefined);
  });

  it('reads chores exactly once, on the render path, for an account holding active Coaching Links', async () => {
    holdsActiveCoachingLinks.mockResolvedValue(true);
    await render();
    // Before the response, not in after(): a popup a page late is the
    // Briefing line the ticket refuses (triage, 2026-09-17).
    expect(getCoachChores).toHaveBeenCalledTimes(1);
    expect(getCoachChores).toHaveBeenCalledWith('user_coach');
    for (const cb of afterCallbacks) await cb();
    expect(getCoachChores).toHaveBeenCalledTimes(1);
  });

  it('costs an athlete without links no read at all', async () => {
    holdsActiveCoachingLinks.mockResolvedValue(false);
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', syntheticLabel: null, profile: {} });
    await render();
    expect(getCoachChores).not.toHaveBeenCalled();
  });

  it('renders the dialog before the page when there are chores, and nothing when there are none', async () => {
    holdsActiveCoachingLinks.mockResolvedValue(true);
    const chore = { kind: 'repin-block-set', athleteId: 'a1', athleteName: 'Sarah' };
    getCoachChores.mockResolvedValue([chore]);
    const element = await render();
    const children = (element as unknown as { props: { children: unknown[] } }).props.children;
    expect(Array.isArray(children)).toBe(true);
    const [dialog] = children as { type: unknown; props: Record<string, unknown> }[];
    expect(dialog.type).toBe(CoachChoresDialog);
    expect(dialog.props.chores).toEqual([chore]);

    getCoachChores.mockResolvedValue([]);
    const empty = await render();
    const [none] = (empty as unknown as { props: { children: unknown[] } }).props.children;
    expect(none).toBeNull();
  });

  it('a failed chores read is logged and costs the coach the popup, not the shell', async () => {
    holdsActiveCoachingLinks.mockResolvedValue(true);
    getCoachChores.mockRejectedValueOnce(new Error('driver down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render()).resolves.toBeDefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
