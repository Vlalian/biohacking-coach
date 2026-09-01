import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import type { ActiveConsent } from '@/features/consent/consent';

/**
 * The order these writes happen in is the whole point of this file, so the mock
 * records operations rather than returning rows.
 *
 * `athlete.userId` and `coach.userId` declare no `onDelete`, so Postgres refuses
 * to delete the `user` row while either still references it. A wrong order is a
 * runtime foreign-key violation against a real database — and against a mocked
 * chain it is invisible unless the test asserts the sequence. So it asserts the
 * sequence.
 */
let ops: string[] = [];
let activeConsents: ActiveConsent[] = [];
let insertedValues: unknown[] = [];

const tableName = (t: unknown) => getTableConfig(t as PgTable).name;

vi.mock('@/db', () => ({
  getDb: () => ({
    insert: (table: unknown) => {
      ops.push(`insert:${tableName(table)}`);
      return {
        values: async (v: unknown) => {
          insertedValues.push(v);
        },
      };
    },
    delete: (table: unknown) => {
      ops.push(`delete:${tableName(table)}`);
      return { where: async () => {} };
    },
  }),
}));

vi.mock('@/features/consent/consent-repository', () => ({
  getActiveConsents: async () => activeConsents,
}));

const { eraseAccount } = await import('./erasure-repository');

beforeEach(() => {
  ops = [];
  insertedValues = [];
  activeConsents = [];
});

describe('eraseAccount', () => {
  it('deletes the athlete row before the user row', async () => {
    await eraseAccount({ athleteId: 'a1', userId: 'u1', coachId: null });

    expect(ops.indexOf('delete:athlete')).toBeLessThan(ops.indexOf('delete:user'));
  });

  it('writes the erasure log before anything is destroyed', async () => {
    // If a delete fails part-way the log is already there, so the erasure leaves
    // evidence rather than nothing. The other order loses both.
    await eraseAccount({ athleteId: 'a1', userId: 'u1', coachId: null });

    expect(ops[0]).toBe('insert:erasure_log');
  });

  it('does not attempt a coach delete for an athlete who holds no coach row', async () => {
    await eraseAccount({ athleteId: 'a1', userId: 'u1', coachId: null });

    expect(ops).toEqual(['insert:erasure_log', 'delete:athlete', 'delete:user']);
  });

  it('deletes the coach row too, before the user row, for an athlete who is also a Head Coach', async () => {
    await eraseAccount({ athleteId: 'a1', userId: 'u1', coachId: 'c1' });

    expect(ops).toEqual([
      'insert:erasure_log',
      'delete:athlete',
      'delete:coach',
      'delete:user',
    ]);
  });

  it('logs the purposes that were active, with the version each was granted under', async () => {
    activeConsents = [
      { purpose: 'ai_coaching', disclosureVersion: '2026-08-07' },
      { purpose: 'health_data', disclosureVersion: '2026-08-07' },
    ];

    await eraseAccount({ athleteId: 'a1', userId: 'u1', coachId: null });

    expect(insertedValues[0]).toMatchObject({
      consentedPurposes: [
        { purpose: 'ai_coaching', disclosureVersion: '2026-08-07' },
        { purpose: 'health_data', disclosureVersion: '2026-08-07' },
      ],
    });
  });

  it('writes nothing identifying into the log row', async () => {
    activeConsents = [{ purpose: 'ai_coaching', disclosureVersion: '2026-08-07' }];

    await eraseAccount({
      athleteId: 'athlete-uuid-1',
      userId: 'user-id-1',
      coachId: 'coach-uuid-1',
    });

    // The ids are in scope at the call site, which is exactly why this is
    // asserted on the serialised row rather than trusted to the builder.
    const serialised = JSON.stringify(insertedValues[0]);
    expect(serialised).not.toContain('athlete-uuid-1');
    expect(serialised).not.toContain('user-id-1');
    expect(serialised).not.toContain('coach-uuid-1');
  });
});
