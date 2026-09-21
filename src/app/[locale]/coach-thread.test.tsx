import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoachOverlayContext, type ChatSeed } from '@/components/shell/coach-overlay-context';

/**
 * The one conversation (ADR 0007, amended 2026-09-16): what the thread hands
 * the chat on mount, and the Check-in reminder it hosts above it since the
 * Weekly Session was retired (`training-architecture/21`). Static render: the
 * shapes, not the clicks.
 */
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `${key}()` }));
vi.mock('./coach-chat', () => ({
  CoachChat: ({ initial }: { initial: { conversationId: string; proposal: unknown } | null }) => (
    <div data-mode="chat" data-conversation={initial?.conversationId ?? 'none'} data-has-proposal={String(Boolean(initial?.proposal))} />
  ),
}));
vi.mock('./weekly-actions', () => ({ saveCheckInAction: vi.fn() }));
// The reminder is decided on the client only; the server snapshot is `false`
// so the first paint matches. Static rendering would therefore never show it,
// so the store reads its client snapshot here — the decision itself is what
// these tests are about, and it is pinned as pure in `weekly-offer.test.ts`.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => boolean) => getSnapshot(),
}));

const { CoachThread } = await import('./coach-thread');

const base = {
  open: true,
  setOpen: vi.fn(),
  reference: null,
  setReference: vi.fn(),
  checkInOfferDismissed: false,
  dismissCheckInOffer: vi.fn(),
  chatSeed: null as ChatSeed | null,
  setChatSeed: vi.fn(),
};

const render = (seed: ChatSeed | null, setChatSeed = vi.fn()) =>
  renderToStaticMarkup(
    <CoachOverlayContext.Provider value={{ ...base, chatSeed: seed, setChatSeed }}>
      <CoachThread chatInitial={null} />
    </CoachOverlayContext.Provider>,
  );

describe('CoachThread — a drafted week seeded into the chat', () => {
  it('opens on the chat with no seed', () => {
    const html = render(null);
    expect(html).toContain('data-mode="chat"');
    expect(html).toContain('data-conversation="none"');
  });

  it('opens on the seed’s conversation with its proposal, and clears the seed at once', () => {
    // Cleared on adoption, not on exit: an athlete who cancelled the proposal
    // and closed the overlay must not find the withdrawn week waiting on the
    // next open (CodeRabbit, PR #69).
    const setChatSeed = vi.fn();
    const html = render({ conversationId: 'c1', messages: [], proposal: { sessions: [{ date: '2026-09-22' }] }, seededAt: 1 }, setChatSeed);
    expect(html).toContain('data-mode="chat"');
    expect(html).toContain('data-conversation="c1"');
    expect(html).toContain('data-has-proposal="true"');
    expect(setChatSeed).toHaveBeenCalledWith(null);
  });

  it('offers no way into a Weekly Session — no "Plan my week", no second mode', () => {
    // The behavior is retired (ADR 0007, amended 2026-09-16); the chat is the
    // whole thread, and a restored session no longer exists to hide it.
    const html = render(null);
    expect(html).not.toContain('data-action="plan-week"');
    expect(html).not.toContain('planWeek()');
    expect(html).not.toContain('data-mode="weekly"');
    expect(html).not.toContain('data-chat-hidden');
  });
});

describe('CoachThread — the Check-in reminder on the Weekly Session Day', () => {
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const otherDay = todayName === 'Monday' ? 'Tuesday' : 'Monday';

  const renderWith = (
    offer: { weeklySessionDay: string; hasCheckedInThisWeek: boolean } | null,
    overlay: Partial<typeof base> = {},
  ) =>
    renderToStaticMarkup(
      <CoachOverlayContext.Provider value={{ ...base, ...overlay }}>
        <CoachThread chatInitial={null} checkInOffer={offer} />
      </CoachOverlayContext.Provider>,
    );

  it('asks for a check-in on the athlete’s day when none is filed, with a way in and a way out', () => {
    const html = renderWith({ weeklySessionDay: todayName, hasCheckedInThisWeek: false });
    expect(html).toContain('data-check-in-reminder');
    expect(html).toContain('offerBody()');
    expect(html).toContain('data-action="open-check-in"');
    expect(html).toContain('data-action="dismiss-check-in"');
    // The banner, not yet the form: the Check-in opens on the athlete's tap.
    expect(html).not.toContain('data-check-in-step');
  });

  it('stays silent on any other day', () => {
    expect(renderWith({ weeklySessionDay: otherDay, hasCheckedInThisWeek: false })).not.toContain('data-check-in-reminder');
  });

  it('stays silent once this week’s Check-in is filed', () => {
    expect(renderWith({ weeklySessionDay: todayName, hasCheckedInThisWeek: true })).not.toContain('data-check-in-reminder');
  });

  it('stays silent once waved off — and the chat beneath is untouched either way', () => {
    // Skipping changes nothing: the same chat renders with or without the
    // reminder, and nothing else is offered in its place.
    const dismissed = renderWith({ weeklySessionDay: todayName, hasCheckedInThisWeek: false }, { checkInOfferDismissed: true });
    expect(dismissed).not.toContain('data-check-in-reminder');
    expect(dismissed).toContain('data-mode="chat"');
    expect(dismissed).toContain('data-conversation="none"');
  });

  it('shows nothing when the server sent no offer at all', () => {
    expect(renderWith(null)).not.toContain('data-check-in-reminder');
  });
});
