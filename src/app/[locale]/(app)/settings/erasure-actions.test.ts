import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession, getAthleteByUserId, getCoachByUserId, eraseAccount } = vi.hoisted(
  () => ({
    getSession: vi.fn(),
    getAthleteByUserId: vi.fn(),
    getCoachByUserId: vi.fn(),
    eraseAccount: vi.fn(() => Promise.resolve()),
  }),
);

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
vi.mock('@/features/coach/coach-repository', () => ({ getCoachByUserId }));
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ getUiPrefs: vi.fn() }));
vi.mock('@/features/erasure/erasure-repository', () => ({ eraseAccount }));

const { deleteMyAccountAction } = await import('./erasure-actions');

const SIGNED_IN = { user: { id: 'u1', email: 'athlete@example.com' } };

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(SIGNED_IN);
  getAthleteByUserId.mockResolvedValue({ id: 'a1' });
  getCoachByUserId.mockResolvedValue(undefined);
});

describe('deleteMyAccountAction', () => {
  it('erases the account the session resolves to', async () => {
    const result = await deleteMyAccountAction('athlete@example.com');

    expect(result).toEqual({ ok: true });
    expect(eraseAccount).toHaveBeenCalledWith({
      athleteId: 'a1',
      userId: 'u1',
      coachId: null,
    });
  });

  it('passes the coach id for an athlete who is also a Head Coach', async () => {
    getCoachByUserId.mockResolvedValue({ id: 'c1' });

    await deleteMyAccountAction('athlete@example.com');

    expect(eraseAccount).toHaveBeenCalledWith(
      expect.objectContaining({ coachId: 'c1' }),
    );
  });

  it('refuses when nobody is signed in, and erases nothing', async () => {
    getSession.mockResolvedValue(null);

    expect(await deleteMyAccountAction('athlete@example.com')).toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(eraseAccount).not.toHaveBeenCalled();
  });

  it('refuses when the session resolves to no athlete row, and erases nothing', async () => {
    getAthleteByUserId.mockResolvedValue(undefined);

    expect(await deleteMyAccountAction('athlete@example.com')).toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    expect(eraseAccount).not.toHaveBeenCalled();
  });

  // The UI disables the button until the typed value matches, but a disabled
  // button is a hint, not a control. This is the control.
  it('refuses a confirmation that is not the account email, and erases nothing', async () => {
    expect(await deleteMyAccountAction('someone-else@example.com')).toEqual({
      ok: false,
      reason: 'confirmation-mismatch',
    });
    expect(eraseAccount).not.toHaveBeenCalled();
  });

  it('refuses an empty confirmation, and erases nothing', async () => {
    expect(await deleteMyAccountAction('   ')).toEqual({
      ok: false,
      reason: 'confirmation-mismatch',
    });
    expect(eraseAccount).not.toHaveBeenCalled();
  });

  it('accepts the athlete retyping their own address in a different case', async () => {
    // They are exercising their own right; a capital letter is not a reason to
    // refuse them.
    expect(await deleteMyAccountAction('  Athlete@Example.com ')).toEqual({ ok: true });
    expect(eraseAccount).toHaveBeenCalled();
  });
});
