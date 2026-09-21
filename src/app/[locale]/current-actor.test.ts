import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession, getAthleteByUserId, getCoachByUserId, getUiPrefs } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAthleteByUserId: vi.fn(),
  getCoachByUserId: vi.fn(),
  getUiPrefs: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteByUserId }));
vi.mock('@/features/coach/coach-repository', () => ({ getCoachByUserId }));
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ getUiPrefs }));

const {
  resolveAthleteId,
  resolveAthlete,
  resolveAthleteWithLanguage,
  resolveUserId,
  resolveHeadCoachId,
  resolveErasureSubject,
  resolveHeadCoachWithLanguage,
} = await import('./current-actor');

/**
 * The one implementation of "who is acting" (ADR 0006: the client sends what it
 * wants done, never who it is). Until `preferred-name/02` this module had no
 * test of its own — every action test mocked it — so the seam that decides
 * which identity-side values reach a prompt was itself unpinned.
 */
const USER = { id: 'user_1', name: 'Mads Kilstrup', email: 'mads@example.com' };
const ATHLETE = { id: 'athlete_1' };

beforeEach(() => {
  getSession.mockReset();
  getAthleteByUserId.mockReset();
  getCoachByUserId.mockReset();
  getUiPrefs.mockReset().mockResolvedValue({});
});

describe('signed out', () => {
  beforeEach(() => getSession.mockResolvedValue(null));

  it('every helper refuses without reading a row', async () => {
    expect(await resolveAthleteId()).toBeNull();
    expect(await resolveAthlete()).toBeNull();
    expect(await resolveUserId()).toBeNull();
    expect(await resolveHeadCoachId()).toBeNull();
    expect(await resolveAthleteWithLanguage()).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(await resolveErasureSubject()).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(await resolveHeadCoachWithLanguage()).toEqual({ ok: false, reason: 'not-a-coach' });
    expect(getAthleteByUserId).not.toHaveBeenCalled();
    expect(getCoachByUserId).not.toHaveBeenCalled();
  });
});

describe('signed in', () => {
  beforeEach(() => getSession.mockResolvedValue({ user: USER }));

  it('resolves the opaque athlete id and the whole row through the user seam', async () => {
    getAthleteByUserId.mockResolvedValue(ATHLETE);
    expect(await resolveAthleteId()).toBe('athlete_1');
    expect(await resolveAthlete()).toEqual(ATHLETE);
    expect(getAthleteByUserId).toHaveBeenCalledWith('user_1');
  });

  it('every helper reads the session from the request headers, never from anywhere else', async () => {
    getAthleteByUserId.mockResolvedValue(ATHLETE);
    getCoachByUserId.mockResolvedValue({ id: 'coach_1' });
    await resolveAthleteId();
    await resolveAthlete();
    await resolveAthleteWithLanguage();
    await resolveUserId();
    await resolveHeadCoachId();
    await resolveErasureSubject();
    await resolveHeadCoachWithLanguage();
    expect(getSession).toHaveBeenCalledTimes(7);
    for (const call of getSession.mock.calls) {
      expect(call[0]).toEqual({ headers: expect.any(Headers) });
    }
  });

  it('is null, not an error, for a signed-in user with no athlete row', async () => {
    getAthleteByUserId.mockResolvedValue(undefined);
    expect(await resolveAthleteId()).toBeNull();
    expect(await resolveAthlete()).toBeNull();
    expect(await resolveAthleteWithLanguage()).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(await resolveErasureSubject()).toEqual({ ok: false, reason: 'not-authenticated' });
  });

  it('resolves the user id alone for the writes that belong to the person', async () => {
    expect(await resolveUserId()).toBe('user_1');
  });

  describe('resolveAthleteWithLanguage — the two identity-side values a prompt may carry', () => {
    it('reads the language and the Preferred Name from ui_prefs, keyed by user', async () => {
      getAthleteByUserId.mockResolvedValue(ATHLETE);
      getUiPrefs.mockResolvedValue({ language: 'da', preferredName: 'Captain' });

      expect(await resolveAthleteWithLanguage()).toEqual({
        ok: true,
        athlete: ATHLETE,
        language: 'da',
        preferredName: 'Captain',
      });
      expect(getUiPrefs).toHaveBeenCalledWith('user_1');
    });

    it('carries neither when none was chosen — and never substitutes user.name', async () => {
      getAthleteByUserId.mockResolvedValue(ATHLETE);
      getUiPrefs.mockResolvedValue({});

      const resolved = await resolveAthleteWithLanguage();
      expect(resolved).toEqual({ ok: true, athlete: ATHLETE, language: undefined, preferredName: undefined });
      expect(JSON.stringify(resolved)).not.toContain('Mads');
    });
  });

  describe('the Head Coach capacity', () => {
    it('resolves the coach row independently of the athlete one', async () => {
      getCoachByUserId.mockResolvedValue({ id: 'coach_1' });
      expect(await resolveHeadCoachId()).toBe('coach_1');
      expect(getCoachByUserId).toHaveBeenCalledWith('user_1');
    });

    it('is null for a solo athlete, which is the normal case', async () => {
      getCoachByUserId.mockResolvedValue(undefined);
      expect(await resolveHeadCoachId()).toBeNull();
      expect(await resolveHeadCoachWithLanguage()).toEqual({ ok: false, reason: 'not-a-coach' });
    });

    it('reads the language for the briefing through the same seam', async () => {
      getCoachByUserId.mockResolvedValue({ id: 'coach_1' });
      getUiPrefs.mockResolvedValue({ language: 'da' });
      expect(await resolveHeadCoachWithLanguage()).toEqual({ ok: true, coachId: 'coach_1', language: 'da' });
    });
  });

  describe('resolveErasureSubject', () => {
    it('gathers everything an erasure needs from the session alone', async () => {
      getAthleteByUserId.mockResolvedValue(ATHLETE);
      getCoachByUserId.mockResolvedValue({ id: 'coach_1' });
      expect(await resolveErasureSubject()).toEqual({
        ok: true,
        athleteId: 'athlete_1',
        userId: 'user_1',
        coachId: 'coach_1',
        email: 'mads@example.com',
      });
    });

    it('carries a null coach id for an account with no Roster', async () => {
      getAthleteByUserId.mockResolvedValue(ATHLETE);
      getCoachByUserId.mockResolvedValue(undefined);
      const subject = await resolveErasureSubject();
      expect(subject).toMatchObject({ ok: true, coachId: null });
    });
  });
});
