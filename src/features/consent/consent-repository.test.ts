import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DISCLOSURE_VERSION } from './disclosure';

// A fake query builder, spied so the athlete-scoping and the grant/withdraw
// behaviour can be asserted without a database. `selectWhere` resolves to the
// "existing active grants" a grant reads; `batch` captures the supersede+insert.
const selectWhere = vi.fn();
const batch = vi.fn((_statements: unknown[]) => Promise.resolve());
const updateWhere = vi.fn(() => Promise.resolve());
const updateSet = vi.fn(() => ({ where: updateWhere }));
const insertValues = vi.fn(() => Promise.resolve());

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: selectWhere }) }),
    update: () => ({ set: updateSet }),
    insert: () => ({ values: insertValues }),
    batch,
  }),
}));

const { grantConsent, withdrawConsent, getActiveConsents } = await import(
  './consent-repository'
);

describe('consent repository', () => {
  beforeEach(() => {
    selectWhere.mockReset();
    batch.mockClear();
    updateWhere.mockClear();
    updateSet.mockClear();
    insertValues.mockClear();
  });

  describe('getActiveConsents', () => {
    it('returns the rows the query yields', async () => {
      selectWhere.mockResolvedValue([
        { purpose: 'ai_coaching', disclosureVersion: DISCLOSURE_VERSION },
      ]);

      const result = await getActiveConsents('athlete_1');

      expect(result).toEqual([
        { purpose: 'ai_coaching', disclosureVersion: DISCLOSURE_VERSION },
      ]);
    });
  });

  describe('grantConsent', () => {
    it('is a no-op when the purpose is already granted under the current version', async () => {
      selectWhere.mockResolvedValue([
        { disclosureVersion: DISCLOSURE_VERSION },
      ]);

      await grantConsent('athlete_1', 'ai_coaching');

      // Nothing written: no supersede, no insert.
      expect(batch).not.toHaveBeenCalled();
    });

    it('supersedes a stale-version grant and inserts a fresh one, in one batch', async () => {
      selectWhere.mockResolvedValue([{ disclosureVersion: 'old-version' }]);

      await grantConsent('athlete_1', 'ai_coaching');

      // One batch, two statements — the withdraw of the stale row and the insert
      // of the current-version row, so the partial unique index never sees two
      // active rows for the pair.
      expect(batch).toHaveBeenCalledTimes(1);
      expect(batch.mock.calls[0][0]).toHaveLength(2);
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          athleteId: 'athlete_1',
          purpose: 'ai_coaching',
          disclosureVersion: DISCLOSURE_VERSION,
        }),
      );
    });

    it('inserts a first grant when none exists', async () => {
      selectWhere.mockResolvedValue([]);

      await grantConsent('athlete_1', 'health_data');

      expect(batch).toHaveBeenCalledTimes(1);
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'health_data',
          disclosureVersion: DISCLOSURE_VERSION,
        }),
      );
    });
  });

  describe('withdrawConsent', () => {
    it('stamps withdrawn_at via an update, without inserting', async () => {
      await withdrawConsent('athlete_1', 'product_improvement');

      expect(updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ withdrawnAt: expect.any(Date) }),
      );
      expect(updateWhere).toHaveBeenCalledTimes(1);
      expect(insertValues).not.toHaveBeenCalled();
      expect(batch).not.toHaveBeenCalled();
    });
  });
});
