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
  setPreferredName,
  updateRaceTarget,
  updateRaceDistance,
  upsertTargetRace,
  clearTargetRace,
  createRace,
  deleteRace,
  getRaces,
  getTargetRace,
  setTargetRace,
  addPastRace,
  deletePastRace,
  getPastRaces,
  updateExperienceLevel,
  updateHoursPerWeek,
  refillWeeksFromHours,
  previewRefill,
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
  setPreferredName: vi.fn(() => Promise.resolve()),
  updateRaceTarget: vi.fn(() => Promise.resolve()),
  updateRaceDistance: vi.fn(() => Promise.resolve()),
  upsertTargetRace: vi.fn(() => Promise.resolve()),
  clearTargetRace: vi.fn(() => Promise.resolve()),
  createRace: vi.fn(() => Promise.resolve('race_new')),
  deleteRace: vi.fn(() => Promise.resolve()),
  getRaces: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
  getTargetRace: vi.fn<() => Promise<unknown>>(() => Promise.resolve(null)),
  setTargetRace: vi.fn(() => Promise.resolve()),
  addPastRace: vi.fn(() => Promise.resolve('pr_new')),
  deletePastRace: vi.fn(() => Promise.resolve()),
  getPastRaces: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
  updateExperienceLevel: vi.fn(() => Promise.resolve()),
  updateHoursPerWeek: vi.fn(() => Promise.resolve()),
  refillWeeksFromHours: vi.fn(() => Promise.resolve({ outcome: 'nothing-due', weeks: [] as string[] })),
  previewRefill: vi.fn(() => Promise.resolve([] as string[])),
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
  updateExperienceLevel,
  updateHoursPerWeek,
}));
vi.mock('@/features/coach/block-fill-service', () => ({ refillWeeksFromHours, previewRefill }));
const getLinkForAthlete = vi.fn(() => Promise.resolve(undefined as unknown));
const withdrawPreviewDrafts = vi.fn(() => Promise.resolve(0));
vi.mock('@/features/coach/coach-repository', () => ({
  updateLinkVisibility,
  severLinkForAthlete,
  getLinkForAthlete,
}));
vi.mock('@/features/coach/week-draft-repository', () => ({ withdrawPreviewDrafts }));
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ setUiLanguage, setPreferredName }));
vi.mock('@/features/race/race-repository', () => ({
  upsertTargetRace,
  clearTargetRace,
  createRace,
  deleteRace,
  getRaces,
  getTargetRace,
  setTargetRace,
  addPastRace,
  deletePastRace,
  getPastRaces,
}));

const {
  addPastRaceAction,
  removePastRaceAction,
  updateCommunicationStyleAction,
  updateWeeklySessionDayAction,
  addFixedConstraintAction,
  removeFixedConstraintAction,
  updateLanguageAction,
  updatePreferredNameAction,
  updateRaceDistanceAction,
  updateTargetRaceAction,
  addRaceAction,
  setTargetRaceAction,
  removeRaceAction,
  updateLinkVisibilityAction,
  severCoachingLinkAction,
  updateHoursPerWeekAction,
  previewHoursChangeAction,
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

describe('updatePreferredNameAction (preferred-name/02)', () => {
  it('stores the name on the user, trimmed, keyed by the signed-in user', async () => {
    const result = await updatePreferredNameAction('  Mads ');
    expect(result).toEqual({ ok: true });
    expect(setPreferredName).toHaveBeenCalledWith('user_abc', 'Mads');
  });

  it('clears it when the field is emptied', async () => {
    const result = await updatePreferredNameAction('   ');
    expect(result).toEqual({ ok: true });
    expect(setPreferredName).toHaveBeenCalledWith('user_abc', null);
  });

  it('refuses what the write boundary refuses — an identifier-shaped or oversized value', async () => {
    expect(await updatePreferredNameAction('mads@example.com')).toEqual({ ok: false, reason: 'invalid' });
    expect(await updatePreferredNameAction('a'.repeat(41))).toEqual({ ok: false, reason: 'invalid' });
    expect(setPreferredName).not.toHaveBeenCalled();
  });

  it('refuses when nobody is signed in', async () => {
    getSession.mockResolvedValue(null);
    const result = await updatePreferredNameAction('Mads');
    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(setPreferredName).not.toHaveBeenCalled();
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

describe('races beyond the first (training-architecture/09)', () => {
  const target = {
    id: 'race_t', athleteId: 'athlete_1', name: 'Ironman Copenhagen', date: '2027-08-15',
    distance: 'Full', isTarget: true, createdAt: new Date(),
  };
  const other = { ...target, id: 'race_2', name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic', isTarget: false };

  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: 'user_1' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1', raceDistance: 'Full' });
  });

  describe('addRaceAction', () => {
    it('adds a non-target race when the athlete already has a target', async () => {
      getTargetRace.mockResolvedValue(target);
      await expect(addRaceAction('Olympic Odense', '2027-03-01', 'Olympic')).resolves.toEqual({
        ok: true,
        raceId: 'race_new',
      });
      expect(createRace).toHaveBeenCalledWith(
        'athlete_1',
        { name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic' },
        { asTarget: false },
      );
      expect(updateRaceTarget).not.toHaveBeenCalled();
    });

    it('adds the race as the target, and writes the mirror, when the athlete has none', async () => {
      getTargetRace.mockResolvedValue(null);
      await expect(addRaceAction('Ironman Copenhagen', '2027-08-15', 'Full')).resolves.toEqual({
        ok: true,
        raceId: 'race_new',
      });
      expect(createRace).toHaveBeenCalledWith(
        'athlete_1',
        { name: 'Ironman Copenhagen', date: '2027-08-15', distance: 'Full' },
        { asTarget: true },
      );
      expect(updateRaceTarget).toHaveBeenCalledWith('athlete_1', 'Ironman Copenhagen');
    });

    it('refuses a bad date, an unknown distance, and an empty name', async () => {
      await expect(addRaceAction('X', '2027-02-30', 'Full')).resolves.toEqual({ ok: false, reason: 'invalid' });
      await expect(addRaceAction('X', '2027-03-01', 'Marathon')).resolves.toEqual({ ok: false, reason: 'invalid' });
      await expect(addRaceAction('   ', '2027-03-01', 'Full')).resolves.toEqual({ ok: false, reason: 'invalid' });
      expect(createRace).not.toHaveBeenCalled();
    });
  });

  describe('setTargetRaceAction', () => {
    it('rotates the flag and keeps athlete.race_target in step', async () => {
      // Two answers to one question is the failure: the onboarding greeting and
      // the session-1 arc read the mirror column, the prompt reads the row.
      getRaces.mockResolvedValue([target, other]);
      await expect(setTargetRaceAction('race_2')).resolves.toEqual({ ok: true });
      expect(setTargetRace).toHaveBeenCalledWith('athlete_1', 'race_2');
      expect(updateRaceTarget).toHaveBeenCalledWith('athlete_1', 'Olympic Odense');
    });

    it('refuses a race the athlete does not have', async () => {
      getRaces.mockResolvedValue([target]);
      await expect(setTargetRaceAction('someone_elses')).resolves.toEqual({ ok: false, reason: 'invalid' });
      expect(setTargetRace).not.toHaveBeenCalled();
    });
  });

  describe('removeRaceAction', () => {
    it('removes a non-target race and leaves the mirror alone', async () => {
      getRaces.mockResolvedValue([target, other]);
      await expect(removeRaceAction('race_2')).resolves.toEqual({ ok: true });
      expect(deleteRace).toHaveBeenCalledWith('athlete_1', 'race_2');
      expect(updateRaceTarget).not.toHaveBeenCalled();
    });

    it('removing the target clears the mirror column too', async () => {
      getRaces.mockResolvedValue([target, other]);
      await expect(removeRaceAction('race_t')).resolves.toEqual({ ok: true });
      expect(deleteRace).toHaveBeenCalledWith('athlete_1', 'race_t');
      expect(updateRaceTarget).toHaveBeenCalledWith('athlete_1', null);
    });

    it('refuses a race the athlete does not have', async () => {
      getRaces.mockResolvedValue([target]);
      await expect(removeRaceAction('someone_elses')).resolves.toEqual({ ok: false, reason: 'invalid' });
      expect(deleteRace).not.toHaveBeenCalled();
    });
  });

  it('all three refuse a caller they cannot identify', async () => {
    getSession.mockResolvedValue(null);
    await expect(addRaceAction('X', '2027-03-01', 'Full')).resolves.toEqual({ ok: false, reason: 'not-authenticated' });
    await expect(setTargetRaceAction('race_2')).resolves.toEqual({ ok: false, reason: 'not-authenticated' });
    await expect(removeRaceAction('race_2')).resolves.toEqual({ ok: false, reason: 'not-authenticated' });
  });
});

describe('past races in Settings (training-architecture/35)', () => {
  const HALF = { id: 'pr_1', athleteId: 'athlete_1', distance: 'Half', date: '2025-08-16', finishSeconds: null, note: null, createdAt: new Date() };

  beforeEach(() => {
    getSession.mockResolvedValue({ user: { id: 'user_1' } });
    getAthleteByUserId.mockResolvedValue({ id: 'athlete_1' });
  });

  it('addPastRaceAction validates, inserts for the signed-in athlete, and re-derives the experience level from the list', async () => {
    getPastRaces.mockResolvedValue([HALF]);
    await expect(addPastRaceAction({ distance: 'Olympic', date: '2024-06-01', finishSeconds: 9000, note: ' first ' })).resolves.toEqual({ ok: true, pastRaceId: 'pr_new' });
    expect(addPastRace).toHaveBeenCalledWith('athlete_1', { distance: 'Olympic', date: '2024-06-01', finishSeconds: 9000, note: 'first' });
    // Re-read after the insert: one race in the mock list → intermediate.
    expect(updateExperienceLevel).toHaveBeenCalledWith('athlete_1', 'intermediate');
  });

  it('refuses a future date, an unknown distance and a bad finish without touching storage', async () => {
    await expect(addPastRaceAction({ distance: 'Half', date: '2099-01-01' })).resolves.toEqual({ ok: false, reason: 'invalid' });
    await expect(addPastRaceAction({ distance: 'Marathon', date: '2025-01-01' })).resolves.toEqual({ ok: false, reason: 'invalid' });
    await expect(addPastRaceAction({ distance: 'Half', date: '2025-01-01', finishSeconds: -1 })).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(addPastRace).not.toHaveBeenCalled();
    expect(updateExperienceLevel).not.toHaveBeenCalled();
  });

  it('removePastRaceAction refuses an id that is not theirs as invalid, and re-derives after a real remove', async () => {
    // The athlete has a race, and the id asked for is a different one: not theirs.
    getPastRaces.mockResolvedValue([HALF]);
    await expect(removePastRaceAction('other')).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(deletePastRace).not.toHaveBeenCalled();
    expect(updateExperienceLevel).not.toHaveBeenCalled();

    getPastRaces.mockResolvedValueOnce([HALF]).mockResolvedValueOnce([]);
    await expect(removePastRaceAction('pr_1')).resolves.toEqual({ ok: true });
    expect(deletePastRace).toHaveBeenCalledWith('athlete_1', 'pr_1');
    expect(updateExperienceLevel).toHaveBeenCalledWith('athlete_1', 'beginner');
  });

  it('both refuse a caller that cannot be identified', async () => {
    getSession.mockResolvedValue(null);
    await expect(addPastRaceAction({ distance: 'Half', date: '2025-01-01' })).resolves.toEqual({ ok: false, reason: 'not-authenticated' });
    await expect(removePastRaceAction('pr_1')).resolves.toEqual({ ok: false, reason: 'not-authenticated' });
  });
});

describe('updateHoursPerWeekAction (showable-version/40)', () => {
  it('stores hours inside the bounds and redraws the weeks the structure owns', async () => {
    refillWeeksFromHours.mockResolvedValue({ outcome: 'refilled', weeks: ['2026-10-12'] });

    expect(await updateHoursPerWeekAction(10)).toEqual({ ok: true, redrawn: 1 });
    expect(updateHoursPerWeek).toHaveBeenCalledWith('athlete_1', 10);
    expect(refillWeeksFromHours).toHaveBeenCalledWith('athlete_1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('accepts both ends of the onboarding band', async () => {
    refillWeeksFromHours.mockResolvedValue({ outcome: 'nothing-due', weeks: [] });
    expect(await updateHoursPerWeekAction(1)).toEqual({ ok: true, redrawn: 0 });
    expect(await updateHoursPerWeekAction(30)).toEqual({ ok: true, redrawn: 0 });
  });

  it.each([0, 31, 7.5, Number.NaN])('refuses %s and writes nothing', async (hours) => {
    expect(await updateHoursPerWeekAction(hours)).toEqual({ ok: false, reason: 'invalid' });
    expect(updateHoursPerWeek).not.toHaveBeenCalled();
    expect(refillWeeksFromHours).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller and writes nothing', async () => {
    getSession.mockResolvedValue(null);
    expect(await updateHoursPerWeekAction(10)).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(updateHoursPerWeek).not.toHaveBeenCalled();
  });
});

describe('previewHoursChangeAction (showable-version/40)', () => {
  it('names the weeks a change would redraw, without writing', async () => {
    previewRefill.mockResolvedValue(['2026-10-12', '2026-11-02']);

    expect(await previewHoursChangeAction()).toEqual({ ok: true, weeks: ['2026-10-12', '2026-11-02'] });
    expect(previewRefill).toHaveBeenCalledWith('athlete_1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(updateHoursPerWeek).not.toHaveBeenCalled();
    expect(refillWeeksFromHours).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    getSession.mockResolvedValue(null);
    expect(await previewHoursChangeAction()).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(previewRefill).not.toHaveBeenCalled();
  });
});
