import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getSession,
  getAthleteByUserId,
  mergeAthleteProfile,
  addFixedConstraint,
  removeFixedConstraint,
  updateCommunicationStyle,
  updateLinkVisibility,
  severLinkForAthlete,
  setUiLanguage,
  updateRaceTarget,
  updateRaceDistance,
  upsertTargetRace,
  clearTargetRace,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAthleteByUserId: vi.fn(),
  mergeAthleteProfile: vi.fn(() => Promise.resolve()),
  addFixedConstraint: vi.fn(() => Promise.resolve()),
  removeFixedConstraint: vi.fn(() => Promise.resolve()),
  updateCommunicationStyle: vi.fn(() => Promise.resolve()),
  updateLinkVisibility: vi.fn(() => Promise.resolve()),
  severLinkForAthlete: vi.fn(() => Promise.resolve()),
  setUiLanguage: vi.fn(() => Promise.resolve()),
  updateRaceTarget: vi.fn(() => Promise.resolve()),
  updateRaceDistance: vi.fn(() => Promise.resolve()),
  upsertTargetRace: vi.fn(() => Promise.resolve()),
  clearTargetRace: vi.fn(() => Promise.resolve()),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/features/athlete/athlete-repository', () => ({
  getAthleteByUserId,
  mergeAthleteProfile,
  addFixedConstraint,
  removeFixedConstraint,
  updateCommunicationStyle,
  updateRaceTarget,
  updateRaceDistance,
}));
const getLinkForAthlete = vi.fn(() => Promise.resolve(undefined as unknown));
const withdrawPreviewDrafts = vi.fn(() => Promise.resolve(0));
vi.mock('@/features/coach/coach-repository', () => ({
  updateLinkVisibility,
  severLinkForAthlete,
  getLinkForAthlete,
}));
vi.mock('@/features/coach/week-draft-repository', () => ({ withdrawPreviewDrafts }));
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ setUiLanguage }));
vi.mock('@/features/race/race-repository', () => ({ upsertTargetRace, clearTargetRace }));

const {
  updateCommunicationStyleAction,
  updateWeeklySessionDayAction,
  addFixedConstraintAction,
  removeFixedConstraintAction,
  updateLanguageAction,
  updateRaceDistanceAction,
  updateTargetRaceAction,
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

  it('refuses with linked, writing nothing, while a Head Coach is linked — the day is theirs (training-architecture/17)', async () => {
    getLinkForAthlete.mockResolvedValueOnce({ headCoachName: 'Lars', link: { status: 'active' } });
    const result = await updateWeeklySessionDayAction('Sunday');
    expect(result).toEqual({ ok: false, reason: 'linked' });
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
  });

  it('refuses Flexible — retired 2026-09-14; a stored one still reads as Sunday', async () => {
    const result = await updateWeeklySessionDayAction('Flexible');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
  });

  it('accepts every weekday, not only the old onboarding shortlist', async () => {
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(await updateWeeklySessionDayAction(day)).toEqual({ ok: true });
    }
  });

  it('refuses a value outside the closed set', async () => {
    const result = await updateWeeklySessionDayAction('Someday');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
  });
});

// The next list is derived inside the UPDATE, not computed here from a value
// read a moment earlier — two edits in flight together would each write a list
// missing the other's day. So the action's job is the closed-set check and the
// athlete scope; what the array becomes is the repository's (and Postgres').
describe('addFixedConstraintAction', () => {
  it('delegates the append, scoped to the acting athlete', async () => {
    const result = await addFixedConstraintAction('Monday');
    expect(result).toEqual({ ok: true });
    expect(addFixedConstraint).toHaveBeenCalledWith('athlete_1', 'Monday');
  });

  it('does not read the current list to decide the next one', async () => {
    // The old shape read the profile, appended in JS and wrote the whole array.
    // Asserting the absence keeps that race from creeping back in.
    getAthleteByUserId.mockResolvedValue(
      athlete({ profile: { fixedConstraints: ['Monday'] } }),
    );

    await addFixedConstraintAction('Thursday');

    expect(addFixedConstraint).toHaveBeenCalledWith('athlete_1', 'Thursday');
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
  });

  it('leaves the duplicate case to the idempotent write, not a pre-check', async () => {
    getAthleteByUserId.mockResolvedValue(
      athlete({ profile: { fixedConstraints: ['Monday'] } }),
    );

    const result = await addFixedConstraintAction('Monday');

    expect(result).toEqual({ ok: true });
    expect(addFixedConstraint).toHaveBeenCalledWith('athlete_1', 'Monday');
  });

  it('rejects anything outside the weekday set — including "Flexible"', async () => {
    const result = await addFixedConstraintAction('Flexible');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(addFixedConstraint).not.toHaveBeenCalled();
  });
});

describe('removeFixedConstraintAction', () => {
  it('delegates the removal, scoped to the acting athlete', async () => {
    getAthleteByUserId.mockResolvedValue(
      athlete({ profile: { fixedConstraints: ['Monday', 'Thursday'] } }),
    );

    const result = await removeFixedConstraintAction('Monday');
    expect(result).toEqual({ ok: true });
    expect(removeFixedConstraint).toHaveBeenCalledWith('athlete_1', 'Monday');
    expect(mergeAthleteProfile).not.toHaveBeenCalled();
  });

  it('refuses when nobody is signed in', async () => {
    getSession.mockResolvedValue(null);

    const result = await removeFixedConstraintAction('Monday');

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(removeFixedConstraint).not.toHaveBeenCalled();
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

// ── The horizon, editable after onboarding (training-architecture/02) ─────────

describe('Race Distance is editable, and stays a closed set', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: 'user_1' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', raceDistance: 'Half' });
  });

  it('stores one of the four', async () => {
    await expect(updateRaceDistanceAction('Full')).resolves.toEqual({ ok: true });
    expect(updateRaceDistance).toHaveBeenCalledWith('athlete_1', 'Full');
  });

  it('refuses anything else, and stores nothing', async () => {
    // The same gate onboarding applies. Settings is a second door onto the same
    // column, and a door with a weaker lock is not a door.
    for (const bad of ['Ironman', '', 'full']) {
      await expect(updateRaceDistanceAction(bad)).resolves.toEqual({
        ok: false,
        reason: 'invalid',
      });
    }
    expect(updateRaceDistance).not.toHaveBeenCalled();
  });
});

describe('the Target Race is editable, name and date together', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: 'user_1' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', raceDistance: 'Full' });
  });

  it('saves a name and a date', async () => {
    await expect(
      updateTargetRaceAction('Ironman Copenhagen', '2027-08-15'),
    ).resolves.toEqual({ ok: true });
    expect(upsertTargetRace).toHaveBeenCalledWith('athlete_1', {
      name: 'Ironman Copenhagen',
      date: '2027-08-15',
      distance: 'Full',
    });
    // `athlete.raceTarget` stays in step: the Coach's session-1 arc and the
    // onboarding greeting both read it, so a race edited here and not there
    // would leave two answers to one question.
    expect(updateRaceTarget).toHaveBeenCalledWith('athlete_1', 'Ironman Copenhagen');
  });

  it('refuses a name with no date, and a date that is not a real day', async () => {
    await expect(updateTargetRaceAction('Ironman Copenhagen', '')).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
    await expect(
      updateTargetRaceAction('Ironman Copenhagen', '2027-02-30'),
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(upsertTargetRace).not.toHaveBeenCalled();
  });

  it('clears the target when both are emptied', async () => {
    // An athlete between races has no target. Clearing is a real state, not a
    // failed edit.
    await expect(updateTargetRaceAction('', '')).resolves.toEqual({ ok: true });
    expect(clearTargetRace).toHaveBeenCalledWith('athlete_1');
    expect(updateRaceTarget).toHaveBeenCalledWith('athlete_1', null);
  });

  it('refuses to create a race for an athlete with no Race Distance', async () => {
    // A Race carries a distance, and there is nowhere honest to get one from.
    // Guessing it from the race name is the habit this slice removed.
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', raceDistance: null });
    await expect(
      updateTargetRaceAction('Ironman Copenhagen', '2027-08-15'),
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(upsertTargetRace).not.toHaveBeenCalled();
  });
});

describe('the horizon actions refuse a caller they cannot identify', () => {
  it('stores nothing when nobody is signed in', async () => {
    getSession.mockResolvedValue(null);

    await expect(updateRaceDistanceAction('Full')).resolves.toEqual({
      ok: false,
      reason: 'not-authenticated',
    });
    await expect(
      updateTargetRaceAction('Ironman Copenhagen', '2027-08-15'),
    ).resolves.toEqual({ ok: false, reason: 'not-authenticated' });
    expect(updateRaceDistance).not.toHaveBeenCalled();
    expect(upsertTargetRace).not.toHaveBeenCalled();
  });

  it('refuses a race name past the length cap before reading the athlete', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_1' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', raceDistance: 'Full' });

    await expect(
      updateTargetRaceAction('x'.repeat(121), '2027-08-15'),
    ).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(upsertTargetRace).not.toHaveBeenCalled();
  });
});

describe('severCoachingLinkAction — a draft in the departed coach’s preview is withdrawn', () => {
  it('withdraws preview drafts after severing, dated by the server', async () => {
    getSession.mockResolvedValue({ user: { id: 'user_abc' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', profile: {} });
    const { severCoachingLinkAction } = await import('./settings-actions');
    expect(await severCoachingLinkAction()).toEqual({ ok: true });
    expect(severLinkForAthlete).toHaveBeenCalledWith('athlete_1');
    expect(withdrawPreviewDrafts).toHaveBeenCalledWith('athlete_1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });
});
