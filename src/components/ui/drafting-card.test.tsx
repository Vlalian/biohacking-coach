import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COACH_EXPECTED_SECONDS } from '@/lib/generation';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(',')})`,
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { DraftingCard, draftingCopy } = await import('./drafting-card');

/** The slot says a draft is coming (training-architecture/29). */
describe('DraftingCard', () => {
  it('says the Coach is drafting, with the shared estimate, as a live status for the named week', () => {
    const html = renderToStaticMarkup(<DraftingCard weekStart="2026-09-21" />);
    expect(html).toContain('data-drafting-card="2026-09-21"');
    expect(html).toContain('role="status"');
    expect(html).toContain(`drafting(seconds=${COACH_EXPECTED_SECONDS})`);
    expect(html).toContain('data-slot="thinking"');
  });

  it('draftingCopy: drafting carries the estimate; gave-up is the not-yet line with no number', () => {
    expect(draftingCopy('drafting', 30)).toEqual({ key: 'drafting', values: { seconds: 30 } });
    expect(draftingCopy('gave-up', 30)).toEqual({ key: 'notYet' });
  });
});
