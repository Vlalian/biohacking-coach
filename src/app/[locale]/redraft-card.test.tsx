import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COACH_EXPECTED_SECONDS } from '@/lib/generation';

/**
 * `training-architecture/24` — the one way a week is drafted twice: the
 * athlete declined the Coach's draft and asks once more. A card in the
 * proposal card's place, never a modal.
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('./week-draft-actions', () => ({ redraftWeekAction: vi.fn() }));

const { RedraftCard, redraftOutcomeKey } = await import('./redraft-card');

describe('RedraftCard', () => {
  const html = renderToStaticMarkup(<RedraftCard weekStart="2026-09-21" />);

  it('names the week and offers one button that asks for a draft', () => {
    expect(html).toContain('lead(week=2026-09-21)');
    expect(html).toContain('data-action="redraft"');
    expect(html).toContain('data-redraft-card="2026-09-21"');
  });

  it('is a card, not a modal', () => {
    expect(html).not.toContain('role="dialog"');
  });

  it('reports each outcome by its key, and nothing while idle', () => {
    expect(redraftOutcomeKey({ kind: 'idle' })).toBeNull();
    // The line carries the shared estimate rather than a number in the string (training-architecture/29).
    expect(redraftOutcomeKey({ kind: 'drafting' })).toEqual({ key: 'drafting', values: { seconds: COACH_EXPECTED_SECONDS } });
    expect(redraftOutcomeKey({ kind: 'refused', reason: 'already-planned' })).toEqual({ key: 'alreadyPlanned' });
    expect(redraftOutcomeKey({ kind: 'refused', reason: 'draft-pending' })).toEqual({ key: 'draftPending' });
    expect(redraftOutcomeKey({ kind: 'refused', reason: 'not-declined' })).toEqual({ key: 'notDeclined' });
    expect(redraftOutcomeKey({ kind: 'refused', reason: 'no-window' })).toEqual({ key: 'noWindow' });
    expect(redraftOutcomeKey({ kind: 'refused', reason: 'consent-required' })).toEqual({ key: 'consentRequired' });
    expect(redraftOutcomeKey({ kind: 'refused', reason: 'coach-failed' })).toEqual({ key: 'error', values: { reason: 'coach-failed' } });
  });
});
