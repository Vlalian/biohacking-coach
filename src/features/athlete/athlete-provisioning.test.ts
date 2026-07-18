import { describe, it, expect, vi, beforeEach } from 'vitest';
import { athlete } from '@/db/schema';

// A tiny stand-in for the athlete table that honours the same two rules the real
// one does: user_id is unique (a Set keyed on it), and onConflictDoNothing means
// a colliding insert is a no-op. That lets a unit test demonstrate the outcome
// the spec asks for — a repeated signup leaves exactly one linked row — without a
// live database, while the real guarantee is the DB's unique constraint.
const rowsByUserId = new Map<string, { userId: string; syntheticLabel: null }>();
const onConflictDoNothing = vi.fn(({ target }: { target: unknown }) => {
  expect(target).toBe(athlete.userId); // the guard must key on the unique column
  return Promise.resolve();
});
const values = vi.fn((row: { userId: string; syntheticLabel: null }) => {
  if (!rowsByUserId.has(row.userId)) rowsByUserId.set(row.userId, row);
  return { onConflictDoNothing };
});
const insert = vi.fn(() => ({ values }));

vi.mock('@/db', () => ({
  getDb: () => ({ insert }),
}));

const { provisionAthlete } = await import('./athlete-provisioning');

describe('provisionAthlete', () => {
  beforeEach(() => {
    rowsByUserId.clear();
    insert.mockClear();
    values.mockClear();
    onConflictDoNothing.mockClear();
  });

  it('inserts one athlete row linked to the user, with no name on it', async () => {
    await provisionAthlete('user_abc');

    expect(insert).toHaveBeenCalledWith(athlete);
    expect(values).toHaveBeenCalledWith({
      userId: 'user_abc',
      // Null, not a name: a real athlete's name is user.name (route 06).
      syntheticLabel: null,
    });
  });

  it('leaves exactly one linked row when the same user is provisioned twice', async () => {
    // A retried signup fires the create hook again for the same user. The guard
    // (onConflictDoNothing on the unique user_id) is applied every time, so the
    // second provisioning adds no row.
    await provisionAthlete('user_abc');
    await provisionAthlete('user_abc');

    expect(rowsByUserId.size).toBe(1);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(2);
  });
});
