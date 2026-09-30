import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveAthleteId, recordFeedback } = vi.hoisted(() => ({
  resolveAthleteId: vi.fn(),
  recordFeedback: vi.fn((_row: unknown) => Promise.resolve()),
}));

vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/feedback/feedback-repository', () => ({ recordFeedback }));

const { submitFeedbackAction } = await import('./feedback-actions');

/** What reached the store, in the order it arrived. */
const stored = () => recordFeedback.mock.calls.map(([row]) => row);

describe('submitFeedbackAction', () => {
  beforeEach(() => {
    resolveAthleteId.mockReset().mockResolvedValue('athlete_1');
    recordFeedback.mockClear();
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

  it('refuses a signed-out caller and stores nothing', async () => {
    resolveAthleteId.mockResolvedValue(null);

    expect(await submitFeedbackAction({ body: 'hello', view: null })).toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(stored()).toEqual([]);
  });
});
