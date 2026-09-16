import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoachOverlayContext, type WeeklySeed } from '@/components/shell/coach-overlay-context';

/**
 * `training-architecture/18` — a Weekly Session seeded from the calendar opens
 * the thread in weekly mode on that conversation. Static render: what mode the
 * thread picks on mount, and what it hands the session.
 */
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `${key}()` }));
vi.mock('./coach-chat', () => ({ CoachChat: () => <div data-mode="chat" /> }));
vi.mock('./weekly-session', () => ({
  WeeklySession: ({ initial }: { initial: { conversationId: string; proposal: unknown } | null }) => (
    <div data-mode="weekly" data-conversation={initial?.conversationId ?? 'none'} data-has-proposal={String(Boolean(initial?.proposal))} />
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
  weeklySeed: null as WeeklySeed | null,
  setWeeklySeed: vi.fn(),
};

const render = (seed: WeeklySeed | null) =>
  renderToStaticMarkup(
    <CoachOverlayContext.Provider value={{ ...base, weeklySeed: seed }}>
      <CoachThread chatInitial={null} weeklyInitial={null} />
    </CoachOverlayContext.Provider>,
  );

describe('CoachThread — a seeded Weekly Session', () => {
  it('opens in chat with no seed and no restored session', () => {
    expect(render(null)).toContain('data-mode="chat"');
  });

  it('opens in weekly mode on the seed’s conversation, proposal and all', () => {
    const html = render({
      conversationId: 'c1',
      weeklySessionNumber: 2,
      messages: [],
      proposal: { sessions: [{ date: '2026-09-22' }] },
      ended: false,
    });
    expect(html).toContain('data-mode="weekly"');
    expect(html).toContain('data-conversation="c1"');
    expect(html).toContain('data-has-proposal="true"');
  });
});
