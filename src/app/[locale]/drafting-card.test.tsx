import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COACH_EXPECTED_SECONDS } from '@/lib/generation';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(',')})`,
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const draftLandedAction = vi.fn();
const coachDraftLandedAction = vi.fn();
vi.mock('./week-draft-actions', () => ({ draftLandedAction }));
vi.mock('./(app)/coach/athlete/[athleteId]/week-draft-actions', () => ({ coachDraftLandedAction }));

const { DraftingCard, draftingCopy, landedProbe } = await import('./drafting-card');

/** The slot says a draft is coming (training-architecture/29). */
describe('DraftingCard', () => {
  it('says the Coach is drafting, with the shared estimate, as a live status for the named week', () => {
    const html = renderToStaticMarkup(<DraftingCard weekStart="2026-09-21" waiter={{ side: 'athlete' }} />);
    expect(html).toContain('data-drafting-card="2026-09-21"');
    expect(html).toContain('role="status"');
    expect(html).toContain(`drafting(seconds=${COACH_EXPECTED_SECONDS})`);
    expect(html).toContain('data-slot="thinking"');
  });

  it('landedProbe: the athlete asks for their own week, the coach for the athlete’s — a read each, never a refresh', async () => {
    // The review of the 24+29 batch found the poll refreshing the page, which
    // re-ran the shell's after() and started the draft again each tick.
    draftLandedAction.mockResolvedValue(true);
    expect(await landedProbe({ side: 'athlete' }, '2026-09-21')()).toBe(true);
    expect(draftLandedAction).toHaveBeenCalledWith('2026-09-21');
    coachDraftLandedAction.mockResolvedValue(false);
    expect(await landedProbe({ side: 'coach', athleteId: 'a1' }, '2026-09-21')()).toBe(false);
    expect(coachDraftLandedAction).toHaveBeenCalledWith('a1', '2026-09-21');
  });

  it('draftingCopy: drafting carries the estimate; gave-up is the not-yet line with no number', () => {
    expect(draftingCopy('drafting', 30)).toEqual({ key: 'drafting', values: { seconds: 30 } });
    expect(draftingCopy('gave-up', 30)).toEqual({ key: 'notYet' });
  });
});
