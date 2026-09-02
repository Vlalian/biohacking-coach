import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake query builder, spied so the athlete-scoping and the stored shape can be
// asserted without a database — the pattern every repository test here uses.
const insertValues = vi.fn((_row: Record<string, unknown>) => Promise.resolve());
const selectLimit = vi.fn();
const selectColumns = vi.fn();
const selectWhere = vi.fn((_condition: unknown) => ({ limit: selectLimit }));

vi.mock('@/db', () => ({
  getDb: () => ({
    insert: () => ({ values: insertValues }),
    select: (columns: unknown) => {
      selectColumns(columns);
      return { from: () => ({ where: selectWhere }) };
    },
  }),
}));

/**
 * The literal values a drizzle condition carries.
 *
 * A `SQL` is a tree of chunks — string fragments, columns, and bound params —
 * and the values a query filters on are in the params. Walked rather than
 * stringified because the tree holds back-references to the table.
 */
function conditionValues(value: unknown): string[] {
  const chunks = (value as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return [];
  return chunks.flatMap((chunk) => {
    const inner = (chunk as { value?: unknown })?.value;
    if (typeof inner === 'string') return [inner];
    return conditionValues(chunk);
  });
}

const { recordFallback, recordTrustSignal, hasTrustSignal } = await import(
  './feedback-repository'
);

describe('feedback repository', () => {
  beforeEach(() => {
    insertValues.mockClear();
    selectColumns.mockClear();
    selectWhere.mockClear();
    selectLimit.mockReset().mockResolvedValue([]);
  });

  describe('recordFallback', () => {
    it('stores the text against the athlete’s opaque id and the View they were on', async () => {
      await recordFallback({
        athleteId: 'athlete_1',
        body: 'the plan page was blank all week',
        view: 'training-plan',
        coachFailureReason: null,
      });

      expect(insertValues).toHaveBeenCalledWith({
        athleteId: 'athlete_1',
        kind: 'fallback',
        body: 'the plan page was blank all week',
        view: 'training-plan',
        conversationId: null,
        coachFailureReason: null,
      });
    });

    it('tags a submission that arrived because the Coach could not answer', async () => {
      // The tag is the point: a fallback row with a reason on it is a tester the
      // model failed, which is a signal in itself and not just a degraded path.
      await recordFallback({
        athleteId: 'athlete_1',
        body: 'it just spins',
        view: 'information',
        coachFailureReason: 'coach-unavailable',
      });

      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'fallback', coachFailureReason: 'coach-unavailable' }),
      );
    });

    it('stores no name, email or user id', async () => {
      // ADR 0006: the training data names nobody. The whole row is asserted, so
      // a column added later that carries identity fails this rather than
      // slipping through a field-by-field check.
      await recordFallback({
        athleteId: 'athlete_1',
        body: 'x',
        view: null,
        coachFailureReason: null,
      });

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

  describe('recordTrustSignal', () => {
    it('stores the answer against the interview it was asked in', async () => {
      await recordTrustSignal({
        athleteId: 'athlete_1',
        conversationId: 'conv_1',
        body: 'no — I would have skipped the long run',
      });

      expect(insertValues).toHaveBeenCalledWith({
        athleteId: 'athlete_1',
        kind: 'trust_signal',
        body: 'no — I would have skipped the long run',
        view: null,
        conversationId: 'conv_1',
        coachFailureReason: null,
      });
    });
  });

  describe('hasTrustSignal', () => {
    it('is false for an athlete who has never answered it', async () => {
      expect(await hasTrustSignal('athlete_1')).toBe(false);
    });

    it('is true once an answer exists', async () => {
      selectLimit.mockResolvedValue([{ id: 'fb_1' }]);

      expect(await hasTrustSignal('athlete_1')).toBe(true);
    });

    it('asks only for this athlete’s trust_signal rows', async () => {
      // Without this the query could filter on the wrong kind — or on no kind at
      // all — and every test above would still pass, because they only ever see
      // what the mock decided to return.
      await hasTrustSignal('athlete_1');

      expect(conditionValues(selectWhere.mock.calls[0][0])).toEqual(
        expect.arrayContaining(['athlete_1', 'trust_signal']),
      );
    });

    it('reads one narrow column, not the stored feedback text', async () => {
      // Existence, not content. This query answers "has it been answered", and
      // nothing here should be pulling a tester's words out of the database.
      await hasTrustSignal('athlete_1');

      expect(Object.keys(selectColumns.mock.calls[0][0] as object)).toEqual(['id']);
    });
  });
});
