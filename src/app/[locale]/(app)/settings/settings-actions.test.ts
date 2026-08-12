import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  getAthleteByUserId,
  mergeAthleteProfile,
  updateCommunicationStyle,
  updateLinkVisibility,
  severLinkForAthlete,
  setUiLanguage,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAthleteByUserId: vi.fn(),
  mergeAthleteProfile: vi.fn(() => Promise.resolve()),
  updateCommunicationStyle: vi.fn(() => Promise.resolve()),
  updateLinkVisibility: vi.fn(() => Promise.resolve()),
  severLinkForAthlete: vi.fn(() => Promise.resolve()),
  setUiLanguage: vi.fn(() => Promise.resolve()),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({
  getAthleteByUserId,
  mergeAthleteProfile,
  updateCommunicationStyle,
}));
vi.mock('@/features/coach/coach-repository', () => ({
  updateLinkVisibility,
  severLinkForAthlete,
}));
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ setUiLanguage }));

const {
  updateCommunicationStyleAction,
  updateWeeklySessionDayAction,
  addFixedConstraintAction,
  removeFixedConstraintAction,
  updateLanguageAction,
  updateLinkVisibilityAction,
  severCoachingLinkAction,
} = await import('./settings-actions');

const athlete = (over: Record<string, unknown> = {}) => ({
  id: 'athlete_1',
  profile: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user_abc' } });
  getAthleteByUserId.mockResolvedValue(athlete());
});

describe('updateCommunicationStyleAction', () => {
  it('trims and writes the value', async () => {
    const result = await updateCommunicationStyleAction('  Terse, technical.  ');

    expect(result).toEqual({ ok: true });
    expect(updateCommunicationStyle).toHaveBeenCalledWith('athlete_1', 'Terse, technical.');
  });

  it('refuses an empty value', async () => {
    const result = await updateCommunicationStyleAction('   ');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(updateCommunicationStyle).not.toHaveBeenCalled();
  });

  it('refuses a value over the length cap', async () => {
    const result = await updateCommunicationStyleAction('x'.repeat(301));
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(updateCommunicationStyle).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request without touching storage', async () => {
    getSession.mockResolvedValue(null);
    const result = await updateCommunicationStyleAction('Anything');
    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(updateCommunicationStyle).not.toHaveBeenCalled();
  });
});

describe('updateWeeklySessionDayAction', () => {
  it('accepts a real weekday', async () => {
    const result = await updateWeeklySessionDayAction('Tuesday');
    expect(result).toEqual({ ok: true });
    expect(mergeAthleteProfile).toHaveBeenCalledWith('athlete_1', {
      weeklySessionDay: 'Tuesday',
    });
  });

  it('accepts Flexible, unlike onboarding’s narrower shortlist', async () => {
    const result = await updateWeeklySessionDayAction('Flexible');
    expect(result).toEqual({ ok: true });
    expect(mergeAthleteProfile).toHaveBeenCalledWith('athlete_1', {
      weeklySessionDay: 'Flexible',
    });
  });

  it('refuses a value outside the closed set', async () => {
    const result = await updateWeeklySessionDayAction('Someday');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
  });
});

describe('addFixedConstraintAction', () => {
  it('appends a day to an empty list', async () => {
    const result = await addFixedConstraintAction('Monday');
    expect(result).toEqual({ ok: true });
    expect(mergeAthleteProfile).toHaveBeenCalledWith('athlete_1', {
      fixedConstraints: ['Monday'],
    });
  });

  it('appends onto an existing list without duplicating', async () => {
    getAthleteByUserId.mockResolvedValue(
      athlete({ profile: { fixedConstraints: ['Monday'] } }),
    );

    await addFixedConstraintAction('Thursday');
    expect(mergeAthleteProfile).toHaveBeenCalledWith('athlete_1', {
      fixedConstraints: ['Monday', 'Thursday'],
    });

    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: 'user_abc' } });
    getAthleteByUserId.mockResolvedValue(
      athlete({ profile: { fixedConstraints: ['Monday'] } }),
    );
    const result = await addFixedConstraintAction('Monday');
    expect(result).toEqual({ ok: true });
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
  });

  it('rejects anything outside the weekday set — including "Flexible"', async () => {
    const result = await addFixedConstraintAction('Flexible');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
  });
});

describe('removeFixedConstraintAction', () => {
  it('drops the day from the stored list', async () => {
    getAthleteByUserId.mockResolvedValue(
      athlete({ profile: { fixedConstraints: ['Monday', 'Thursday'] } }),
    );

    const result = await removeFixedConstraintAction('Monday');
    expect(result).toEqual({ ok: true });
    expect(mergeAthleteProfile).toHaveBeenCalledWith('athlete_1', {
      fixedConstraints: ['Thursday'],
    });
  });
});

describe('updateLanguageAction', () => {
  it('persists a supported locale', async () => {
    const result = await updateLanguageAction('da');
    expect(result).toEqual({ ok: true });
    expect(setUiLanguage).toHaveBeenCalledWith('user_abc', 'da');
  });

  it('refuses a locale the app does not support', async () => {
    const result = await updateLanguageAction('fr');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(setUiLanguage).not.toHaveBeenCalled();
  });
});

describe('updateLinkVisibilityAction', () => {
  it('toggles a known section', async () => {
    const result = await updateLinkVisibilityAction('shareAiTranscripts', true);
    expect(result).toEqual({ ok: true });
    expect(updateLinkVisibility).toHaveBeenCalledWith('athlete_1', {
      shareAiTranscripts: true,
    });
  });

  it('refuses a section outside the closed set', async () => {
    const result = await updateLinkVisibilityAction(
      // @ts-expect-error — deliberately outside the closed set, as untrusted input would be
      'somethingElse',
      true,
    );
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(updateLinkVisibility).not.toHaveBeenCalled();
  });
});

describe('severCoachingLinkAction', () => {
  it('severs the caller’s own link', async () => {
    const result = await severCoachingLinkAction();
    expect(result).toEqual({ ok: true });
    expect(severLinkForAthlete).toHaveBeenCalledWith('athlete_1');
  });

  it('refuses a signed-out request', async () => {
    getSession.mockResolvedValue(null);
    const result = await severCoachingLinkAction();
    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(severLinkForAthlete).not.toHaveBeenCalled();
  });
});
