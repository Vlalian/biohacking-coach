import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoachOverlayContext, type ChatSeed } from '@/components/shell/coach-overlay-context';

/**
 * `training-architecture/18`, reworked by `/20` — a drafted week taken into
 * the conversation from the calendar opens the thread in **chat** mode on the
 * athlete's Coach Chat, proposal and all. Static render: what mode the thread
 * picks on mount, and what it hands the chat.
 */
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `${key}()` }));
vi.mock('./coach-chat', () => ({
  CoachChat: ({ initial }: { initial: { conversationId: string; proposal: unknown } | null }) => (
    <div data-mode="chat" data-conversation={initial?.conversationId ?? 'none'} data-has-proposal={String(Boolean(initial?.proposal))} />
  ),
}));
vi.mock('./weekly-session', () => ({
  WeeklySession: ({ initial }: { initial: { conversationId: string } | null }) => (
    <div data-mode="weekly" data-conversation={initial?.conversationId ?? 'none'} />
  ),
}));

const { CoachThread } = await import('./coach-thread');

const base = {
  open: true,
  setOpen: vi.fn(),
  reference: null,
  setReference: vi.fn(),
  weeklyOfferDismissed: false,
  dismissWeeklyOffer: vi.fn(),
  chatSeed: null as ChatSeed | null,
  setChatSeed: vi.fn(),
};

const render = (seed: ChatSeed | null, setChatSeed = vi.fn()) =>
  renderToStaticMarkup(
    <CoachOverlayContext.Provider value={{ ...base, chatSeed: seed, setChatSeed }}>
      <CoachThread chatInitial={null} weeklyInitial={null} />
    </CoachOverlayContext.Provider>,
  );

describe('CoachThread — a drafted week seeded into the chat', () => {
  it('opens in chat with no seed and no restored session', () => {
    const html = render(null);
    expect(html).toContain('data-mode="chat"');
    expect(html).toContain('data-conversation="none"');
  });

  it('opens in chat mode on the seed’s conversation with its proposal, and clears the seed at once', () => {
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

  it('a seed wins over a restored Weekly Session — the athlete tapped Discuss, so that is where they land', () => {
    const html = renderToStaticMarkup(
      <CoachOverlayContext.Provider value={{ ...base, chatSeed: { conversationId: 'c1', messages: [], proposal: null, seededAt: 1 } }}>
        <CoachThread
          chatInitial={null}
          weeklyInitial={{ conversationId: 'w1', weeklySessionNumber: 1, messages: [], proposal: null, ended: false }}
        />
      </CoachOverlayContext.Provider>,
    );
    expect(html).toContain('data-mode="chat"');
    expect(html).toContain('data-conversation="c1"');
  });
});
