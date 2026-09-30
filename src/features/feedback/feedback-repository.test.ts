import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake insert, so the stored row can be read back without a database — the
// pattern every repository test here uses.
const insertValues = vi.fn((_row: Record<string, unknown>) => Promise.resolve());

vi.mock('@/db', () => ({
  getDb: () => ({
    insert: () => ({ values: insertValues }),
  }),
}));

const { recordFeedback } = await import('./feedback-repository');

describe('feedback repository', () => {
  beforeEach(() => {
    insertValues.mockClear();
  });

  describe('recordFeedback', () => {
    it('stores the text against the athlete’s opaque id and the View they came from', async () => {
      // Stored as `fallback`, the kind the plain box has always written, so the
      // readout and the feedback-review ledger read old and new rows alike
      // without a migration (showable-version/58). No interview, so no
      // conversation and no Coach failure to record.
      await recordFeedback({
        athleteId: 'athlete_1',
        body: 'the plan page was blank all week',
        view: '/training-plan',
      });

      expect(insertValues.mock.calls.map(([row]) => row)).toEqual([
        {
          athleteId: 'athlete_1',
          kind: 'fallback',
          body: 'the plan page was blank all week',
          view: '/training-plan',
          conversationId: null,
          coachFailureReason: null,
        },
      ]);
    });

    it('stores no name, email or user id', async () => {
      // ADR 0006: the training data names nobody. The whole row is asserted, so
      // a column added later that carries identity fails this rather than
      // slipping through a field-by-field check.
      await recordFeedback({ athleteId: 'athlete_1', body: 'x', view: null });

      expect(Object.keys(insertValues.mock.calls[0][0]).sort()).toEqual([
        'athleteId',
        'body',
        'coachFailureReason',
        'conversationId',
        'kind',
        'view',
      ]);
    });
  });
});
