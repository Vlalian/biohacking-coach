import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoachOverlayContext } from '@/components/shell/coach-overlay-context';

/**
 * `training-architecture/18` — the athlete's decision card, first render, and
 * the pure copy rules behind its outcome line.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./week-draft-actions', () => ({
  acceptWeekDraftAction: vi.fn(),
  declineWeekDraftAction: vi.fn(),
  discussWeekDraftAction: vi.fn(),
}));

const { ProposalCard, outcomeKey } = await import('./proposal-card');

const DRAFT = {
  id: 'd1',
  weekStart: '2026-09-21',
  visibleFrom: '2026-09-16',
  sessions: [
    { date: '2026-09-22', type: 'Endurance' as const, durationMinutes: 60, zone: 'Z2', note: null },
    { date: '2026-09-27', type: 'Endurance' as const, durationMinutes: 150, zone: 'Z2', note: 'long' },
  ],
  citations: [],
  approved: false,
  createdAt: new Date(),
};

const overlay = {
  open: false,
  setOpen: vi.fn(),
  reference: null,
  setReference: vi.fn(),
  weeklyOfferDismissed: false,
  dismissWeeklyOffer: vi.fn(),
  weeklySeed: null,
  setWeeklySeed: vi.fn(),
};

describe('ProposalCard', () => {
  const html = renderToStaticMarkup(
    <CoachOverlayContext.Provider value={overlay}>
      <ProposalCard draft={DRAFT} />
    </CoachOverlayContext.Provider>,
  );

  it('offers exactly three decisions — accept, discuss, decline — carrying the draft id', () => {
    expect(html).toContain('data-draft-id="d1"');
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html).toContain('data-decision="accept"');
    expect(html).toContain('data-decision="discuss"');
    expect(html).toContain('data-decision="decline"');
    expect(html).toContain('lead(count=2,week=2026-09-21)');
  });

  it('is a card, not a modal: no dialog role, and nothing decided on first render', () => {
    expect(html).not.toMatch(/role="dialog"|aria-modal/);
    expect(html).not.toMatch(/accepted|declined|replaced/);
  });
});

describe('outcomeKey — what the card says after a decision', () => {
  it('says how many days already passed only when some did', () => {
    expect(outcomeKey({ kind: 'accepted', pastDays: 0 })).toEqual({ key: 'accepted' });
    expect(outcomeKey({ kind: 'accepted', pastDays: 2 })).toEqual({ key: 'acceptedPast', values: { count: 2 } });
  });

  it('names a replaced draft, a missing consent, a decline, and an error with its reason; nothing while idle', () => {
    expect(outcomeKey({ kind: 'replaced' })).toEqual({ key: 'replaced' });
    expect(outcomeKey({ kind: 'consentRequired' })).toEqual({ key: 'consentRequired' });
    expect(outcomeKey({ kind: 'declined' })).toEqual({ key: 'declined' });
    expect(outcomeKey({ kind: 'error', reason: 'coach-unavailable' })).toEqual({ key: 'error', values: { reason: 'coach-unavailable' } });
    expect(outcomeKey({ kind: 'idle' })).toBeNull();
  });
});
