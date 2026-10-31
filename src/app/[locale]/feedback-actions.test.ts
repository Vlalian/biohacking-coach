import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FEEDBACK_MAX_LENGTH } from '@/features/feedback/feedback';

const { resolveAthleteId, recordFeedback, hasConsent } = vi.hoisted(() => ({
  resolveAthleteId: vi.fn(),
  recordFeedback: vi.fn((_row: unknown) => Promise.resolve()),
  hasConsent: vi.fn(),
}));

vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/feedback/feedback-repository', () => ({ recordFeedback }));
vi.mock('@/features/consent/consent-gate', () => ({ hasConsent }));

const { submitFeedbackAction } = await import('./feedback-actions');

/** What reached the store, in the order it arrived. */
const stored = () => recordFeedback.mock.calls.map(([row]) => row);

describe('submitFeedbackAction', () => {
  beforeEach(() => {
    resolveAthleteId.mockReset().mockResolvedValue('athlete_1');
    recordFeedback.mockClear();
    hasConsent.mockReset().mockResolvedValue(true);
  });

  it('refuses feedback without the product-improvement consent and stores nothing', async () => {
    hasConsent.mockResolvedValue(false);

    expect(await submitFeedbackAction({ body: 'great', view: null })).toEqual({ ok: false, reason: 'consent-required' });
    expect(stored()).toEqual([]);
    expect(hasConsent).toHaveBeenCalledWith('athlete_1', 'product_improvement');
  });

  it('stores the text with the View the tester came from', async () => {
    const result = await submitFeedbackAction({
      body: 'the calendar never loaded',
      view: '/training-plan',
    });

    expect(result).toEqual({ ok: true });
    expect(stored()).toEqual([
      { athleteId: 'athlete_1', body: 'the calendar never loaded', view: '/training-plan' },
    ]);
  });

  it('stores the text trimmed', async () => {
    await submitFeedbackAction({ body: '  it jumped back  \n', view: null });

    expect(stored()).toEqual([{ athleteId: 'athlete_1', body: 'it jumped back', view: null }]);
  });

  it('drops a View that is not shaped like a path, and still stores the text', async () => {
    // The View rides in the escape hatch's link, so it is client-supplied.
    await submitFeedbackAction({ body: 'x', view: 'javascript:alert(1)' });

    expect(stored()).toEqual([{ athleteId: 'athlete_1', body: 'x', view: null }]);
  });

  it('refuses an empty submission and stores nothing', async () => {
    expect(await submitFeedbackAction({ body: '   ', view: null })).toEqual({
      ok: false,
      reason: 'empty',
    });
    expect(stored()).toEqual([]);
  });

  it('refuses a comment over the length cap and stores nothing, and takes one at the cap (CodeRabbit, PR #120)', async () => {
    expect(await submitFeedbackAction({ body: 'x'.repeat(FEEDBACK_MAX_LENGTH + 1), view: null })).toEqual({
      ok: false,
      reason: 'too-long',
    });
    expect(stored()).toEqual([]);

    expect(await submitFeedbackAction({ body: 'x'.repeat(FEEDBACK_MAX_LENGTH), view: null })).toEqual({ ok: true });
    expect(stored()).toHaveLength(1);
  });

  it('refuses a signed-out caller and stores nothing', async () => {
    resolveAthleteId.mockResolvedValue(null);

    expect(await submitFeedbackAction({ body: 'hello', view: null })).toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(stored()).toEqual([]);
  });
});
