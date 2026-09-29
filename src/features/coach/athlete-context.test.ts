import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '@/features/session/session';
import type { CoachingLink } from './coach';

const repo = vi.hoisted(() => ({
  getAthleteById: vi.fn(),
  getLanguageForAthlete: vi.fn(),
  getResolvedBlocks: vi.fn(),
  getEquipmentItems: vi.fn(),
  getCheckInForWeek: vi.fn(),
  capacityFor: vi.fn(),
  getRaces: vi.fn(),
  getPresenceStage: vi.fn(),
  getUnavailableDates: vi.fn(),
  getSessionsForWeek: vi.fn(),
  getSessionsInRange: vi.fn(),
  getBriefingReflections: vi.fn(),
  getSharedTranscripts: vi.fn(),
  getOpenInjuries: vi.fn(),
  getOpenIllnesses: vi.fn(),
  getSessionMovesSince: vi.fn(),
  getRecentAthleteChatLines: vi.fn(),
}));

vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteById: repo.getAthleteById }));
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ getLanguageForAthlete: repo.getLanguageForAthlete }));
vi.mock('./training-block-service', () => ({ getResolvedBlocks: repo.getResolvedBlocks }));
vi.mock('@/features/equipment/equipment-repository', () => ({ getEquipmentItems: repo.getEquipmentItems }));
vi.mock('./check-in-repository', () => ({ getCheckInForWeek: repo.getCheckInForWeek }));
vi.mock('@/features/health/health-repository', () => ({
  capacityFor: repo.capacityFor,
  getOpenInjuries: repo.getOpenInjuries,
  getOpenIllnesses: repo.getOpenIllnesses,
}));
vi.mock('@/features/race/race-repository', () => ({ getRaces: repo.getRaces }));
vi.mock('./presence-repository', () => ({ getPresenceStage: repo.getPresenceStage }));
vi.mock('@/features/availability/availability-repository', () => ({ getUnavailableDates: repo.getUnavailableDates }));
vi.mock('@/features/session/session-repository', () => ({
  getSessionsForWeek: repo.getSessionsForWeek,
  getSessionsInRange: repo.getSessionsInRange,
  getBriefingReflections: repo.getBriefingReflections,
}));
vi.mock('./coach-repository', () => ({ getSharedTranscripts: repo.getSharedTranscripts }));
vi.mock('@/features/session/session-move-repository', () => ({ getSessionMovesSince: repo.getSessionMovesSince }));
vi.mock('./chat-excerpt-repository', () => ({ getRecentAthleteChatLines: repo.getRecentAthleteChatLines }));

const {
  readAthleteContext,
  draftInclude,
  chatInclude,
  briefingInclude,
  draftContextOf,
  chatContextOf,
  briefingContextOf,
} = await import('./athlete-context');

// Tuesday; the week runs Mon 2026-09-28 – Sun 2026-10-04.
const TODAY = '2026-09-29';
const THIS_WEEK = '2026-09-28';
const NEXT_WEEK = '2026-10-05';

const ATHLETE = {
  id: 'a1',
  experienceLevel: 'intermediate',
  raceDistance: 'Half',
  raceTarget: 'Aarhus 70.3',
  communicationStyle: null,
  trainingSessionsPerWeek: 6,
  profile: { weeklySessionDay: 'Saturday', fixedConstraints: ['Monday'], onboarding: { motivation: 'Completion' } },
} as never;

function link(shareAthleteReports: boolean, shareAiTranscripts: boolean): CoachingLink {
  return { id: 'l1', coachId: 'c1', athleteId: 'a1', status: 'active', visibility: { shareAthleteReports, shareAiTranscripts } };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    date: '2026-09-22',
    type: 'Endurance',
    status: 'completed',
    parked: false,
    sport: null,
    dayOrder: 0,
    version: 1,
    title: null,
    duration: 60,
    zone: 'Z2',
    note: null,
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    origin: 'coach',
    isTraining: true,
    summary: null,
    howTo: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getAthleteById.mockResolvedValue(ATHLETE);
  repo.getLanguageForAthlete.mockResolvedValue('da');
  repo.getResolvedBlocks.mockResolvedValue({ race: null, set: null, blocks: [] });
  repo.getEquipmentItems.mockResolvedValue([]);
  repo.getCheckInForWeek.mockResolvedValue(null);
  repo.capacityFor.mockResolvedValue(null);
  repo.getRaces.mockResolvedValue([]);
  repo.getPresenceStage.mockResolvedValue('building');
  repo.getUnavailableDates.mockResolvedValue([]);
  repo.getSessionsForWeek.mockResolvedValue([]);
  repo.getSessionsInRange.mockResolvedValue([]);
  repo.getBriefingReflections.mockResolvedValue([]);
  repo.getSharedTranscripts.mockResolvedValue(null);
  repo.getOpenInjuries.mockResolvedValue([]);
  repo.getOpenIllnesses.mockResolvedValue([]);
  repo.getSessionMovesSince.mockResolvedValue([]);
  repo.getRecentAthleteChatLines.mockResolvedValue([]);
});

describe('readAthleteContext — one round of reads, and nothing it was not asked for', () => {
  const READ_BY: Record<string, () => unknown> = {
    profile: () => repo.getAthleteById,
    language: () => repo.getLanguageForAthlete,
    equipment: () => repo.getEquipmentItems,
    checkIn: () => repo.getCheckInForWeek,
    body: () => repo.capacityFor,
    races: () => repo.getRaces,
    presence: () => repo.getPresenceStage,
    unavailable: () => repo.getUnavailableDates,
    week: () => repo.getSessionsForWeek,
    reflections: () => repo.getBriefingReflections,
    health: () => repo.getOpenInjuries,
    moves: () => repo.getSessionMovesSince,
    chat: () => repo.getRecentAthleteChatLines,
  };

  it('reads each included signal once, and no other', async () => {
    for (const signal of Object.keys(READ_BY)) {
      vi.clearAllMocks();
      await readAthleteContext('a1', TODAY, { signals: [signal as never] });
      for (const [other, otherReaderOf] of Object.entries(READ_BY)) {
        expect(otherReaderOf(), `${signal} → ${other}`).toHaveBeenCalledTimes(other === signal ? 1 : 0);
      }
      expect(repo.getSessionsInRange).not.toHaveBeenCalled();
      expect(repo.getSharedTranscripts).not.toHaveBeenCalled();
    }
  });

  it('reads the Training Blocks for every purpose', async () => {
    await readAthleteContext('a1', TODAY, { signals: [] });
    expect(repo.getResolvedBlocks).toHaveBeenCalledWith('a1', TODAY);
  });

  it("scopes the Check-in and the week to today's week", async () => {
    await readAthleteContext('a1', TODAY, { signals: ['checkIn', 'week'] });
    expect(repo.getCheckInForWeek).toHaveBeenCalledWith('a1', THIS_WEEK);
    expect(repo.getSessionsForWeek).toHaveBeenCalledWith('a1', THIS_WEEK);
  });

  it('reads the four weeks before the week it is told to count back from', async () => {
    await readAthleteContext('a1', TODAY, { signals: [], historyBefore: NEXT_WEEK });
    expect(repo.getSessionsInRange).toHaveBeenCalledWith('a1', '2026-09-07', NEXT_WEEK);
  });

  it('reads the shared transcripts only through a link, which checks its own flag', async () => {
    const shared = link(false, true);
    await readAthleteContext('a1', TODAY, { signals: [], link: shared });
    expect(repo.getSharedTranscripts).toHaveBeenCalledWith(shared);
  });

  it('passes on what it read', async () => {
    repo.getLanguageForAthlete.mockResolvedValue('da');
    repo.capacityFor.mockResolvedValue('no run');
    repo.getUnavailableDates.mockResolvedValue(['2026-10-01']);
    const ctx = await readAthleteContext('a1', TODAY, chatInclude(TODAY));
    expect(ctx).toMatchObject({ capacity: 'no run', unavailableDates: ['2026-10-01'], language: null, athlete: null });
  });

  it('reads nothing into a signal it was not asked for', async () => {
    const ctx = await readAthleteContext('a1', TODAY, { signals: [] });
    expect(ctx).toMatchObject({
      athlete: null,
      language: null,
      equipment: [],
      checkInRow: null,
      capacity: null,
      races: [],
      presenceStage: null,
      unavailableDates: [],
      weekSessions: [],
      pastSessions: [],
      reflections: null,
      transcripts: null,
      moves: [],
      chatLines: [],
    });
  });

  it('reads a missing athlete row as none', async () => {
    repo.getAthleteById.mockResolvedValue(undefined);
    expect((await readAthleteContext('a1', TODAY, { signals: ['profile'] })).athlete).toBeNull();
  });
});

describe('injuries and illness, as structure only (E1)', () => {
  // The detail thread is not reachable from here at all: nothing on this path
  // imports its reader, which `detail-thread-never-prompts.test.ts` pins.
  it('carries what each prevents, since when and the Bother Rating — never the name', async () => {
    repo.getOpenInjuries.mockResolvedValue([
      { id: 'i1', athleteId: 'a1', swim: 'full', bike: 'easy', run: 'none', name: 'left knee', openedAt: new Date('2026-09-20T08:00:00'), closedAt: null, bother: 3 },
    ]);
    repo.getOpenIllnesses.mockResolvedValue([
      { id: 'x1', athleteId: 'a1', openedAt: new Date('2026-09-27T08:00:00'), closedAt: null, bother: null },
    ]);

    const ctx = await readAthleteContext('a1', TODAY, { signals: ['health'] });

    expect(ctx.health).toEqual({
      injuries: [{ prevents: { swim: 'full', bike: 'easy', run: 'none' }, since: '2026-09-20', botherRating: 3 }],
      illnesses: [{ since: '2026-09-27', botherRating: null }],
    });
    expect(JSON.stringify(ctx.health)).not.toContain('knee');
    expect(repo.getOpenIllnesses).toHaveBeenCalledWith('a1');
  });

  it('reads none when health is not included', async () => {
    const ctx = await readAthleteContext('a1', TODAY, { signals: [] });
    expect(ctx.health).toEqual({ injuries: [], illnesses: [] });
    expect(repo.getOpenIllnesses).not.toHaveBeenCalled();
  });

  it('is read for the draft and Coach Chat, never for the Briefing', async () => {
    await readAthleteContext('a1', TODAY, draftInclude(NEXT_WEEK));
    await readAthleteContext('a1', TODAY, chatInclude(TODAY));
    expect(repo.getOpenInjuries).toHaveBeenCalledTimes(2);
    vi.clearAllMocks();
    await readAthleteContext('a1', TODAY, briefingInclude(link(true, true), true));
    expect(repo.getOpenInjuries).not.toHaveBeenCalled();
  });
});

describe('Session Moves, reflection comments and what the athlete said lately (training-architecture/52)', () => {
  it("reads this week's Session Moves and the last seven days of the athlete's own chat", async () => {
    await readAthleteContext('a1', TODAY, { signals: ['moves', 'chat'] });
    expect(repo.getSessionMovesSince).toHaveBeenCalledWith('a1', THIS_WEEK);
    expect(repo.getRecentAthleteChatLines).toHaveBeenCalledWith('a1', '2026-09-22');
  });

  it('the draft reads both; Coach Chat reads the moves and not its own conversation; the Briefing neither', async () => {
    await readAthleteContext('a1', TODAY, draftInclude(NEXT_WEEK));
    expect(repo.getSessionMovesSince).toHaveBeenCalledTimes(1);
    expect(repo.getRecentAthleteChatLines).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    await readAthleteContext('a1', TODAY, chatInclude(TODAY));
    expect(repo.getSessionMovesSince).toHaveBeenCalledTimes(1);
    expect(repo.getRecentAthleteChatLines).not.toHaveBeenCalled();
    vi.clearAllMocks();
    await readAthleteContext('a1', TODAY, briefingInclude(link(true, true), true));
    expect(repo.getSessionMovesSince).not.toHaveBeenCalled();
    expect(repo.getRecentAthleteChatLines).not.toHaveBeenCalled();
  });

  it('Coach Chat reads the four weeks up to the end of this one', async () => {
    await readAthleteContext('a1', TODAY, chatInclude(TODAY));
    expect(repo.getSessionsInRange).toHaveBeenCalledWith('a1', '2026-09-07', NEXT_WEEK);
  });

  it("drops a chat line carrying an identifier instead of failing the draft, and shortens a long one", async () => {
    repo.getRecentAthleteChatLines.mockResolvedValue(['mail me at a@b.dk', 'legs heavy', 'x'.repeat(200), 'y'.repeat(160)]);
    const ctx = await readAthleteContext('a1', TODAY, draftInclude(NEXT_WEEK));
    const { chat } = draftContextOf(ctx, ATHLETE, { today: TODAY, draftedWeek: NEXT_WEEK });
    expect(chat).toEqual(['legs heavy', `${'x'.repeat(159)}…`, 'y'.repeat(160)]);
  });

  // An 18-digit run is no phone shape; cut at 159 characters it leaves eight
  // digits before the ellipsis, which is. The check must see what is sent, or
  // the prompt builder's assertion throws on a line this was meant to drop.
  const CUT_TO_A_PHONE = `${'x'.repeat(150)} ${'1'.repeat(18)}`;

  it('checks the shortened line, not the stored one, so a cut that leaves a phone shape is dropped', async () => {
    repo.getRecentAthleteChatLines.mockResolvedValue([CUT_TO_A_PHONE, 'legs heavy']);
    repo.getSessionsInRange.mockResolvedValue([session({ date: '2026-09-22', feedbackComment: CUT_TO_A_PHONE })]);
    const ctx = await readAthleteContext('a1', TODAY, draftInclude(NEXT_WEEK));
    const { chat, comments } = draftContextOf(ctx, ATHLETE, { today: TODAY, draftedWeek: NEXT_WEEK });
    expect(chat).toEqual(['legs heavy']);
    expect(comments).toEqual([]);
  });

  it('carries the reflection comments of the two weeks before the drafted one, shortened, and drops one carrying an identifier', async () => {
    repo.getSessionsInRange.mockResolvedValue([
      session({ date: '2026-09-20', feedbackComment: 'too old' }),
      session({ date: '2026-09-21', type: 'Swim', feedbackComment: 'first day in' }),
      session({ date: '2026-09-22', type: 'Intensity', feedbackComment: 'hard but good' }),
      session({ date: '2026-09-23', feedbackComment: 'call +45 12 34 56 78' }),
      session({ date: '2026-09-29', feedbackComment: 'c'.repeat(170) }),
      session({ date: '2026-09-30', feedbackComment: null }),
    ]);
    const ctx = await readAthleteContext('a1', TODAY, draftInclude(NEXT_WEEK));
    const { comments } = draftContextOf(ctx, ATHLETE, { today: TODAY, draftedWeek: NEXT_WEEK });
    expect(comments).toEqual([
      { date: '2026-09-21', sessionType: 'Swim', comment: 'first day in' },
      { date: '2026-09-22', sessionType: 'Intensity', comment: 'hard but good' },
      { date: '2026-09-29', sessionType: 'Endurance', comment: `${'c'.repeat(159)}…` },
    ]);
  });

  it('hands the draft and Coach Chat the health facts and the moves', async () => {
    const moves = [{ from: '2026-09-29', to: '2026-10-01', by: 'athlete' }];
    repo.getSessionMovesSince.mockResolvedValue(moves);
    const draftCtx = await readAthleteContext('a1', TODAY, draftInclude(NEXT_WEEK));
    const draft = draftContextOf(draftCtx, ATHLETE, { today: TODAY, draftedWeek: NEXT_WEEK });
    expect(draft.moves).toEqual(moves);
    expect(draft.health).toEqual({ injuries: [], illnesses: [] });

    const chatCtx = await readAthleteContext('a1', TODAY, chatInclude(TODAY));
    const chat = chatContextOf(chatCtx, ATHLETE, { today: TODAY, planWrittenAt: null });
    expect(chat.signals.moves).toEqual(moves);
    expect(chat.signals.health).toEqual({ injuries: [], illnesses: [] });
    expect(chat.signals.recentWeeks.map((w) => w.weekStart)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', THIS_WEEK]);
    expect(chat.signals.comments).toEqual([]);
  });
});

describe('what each purpose reads', () => {
  it('the draft reads the athlete, language and four weeks back from the drafted week, and leaves the unavailable dates to its gate', async () => {
    await readAthleteContext('a1', TODAY, draftInclude(NEXT_WEEK));
    for (const reader of [
      repo.getAthleteById,
      repo.getLanguageForAthlete,
      repo.getEquipmentItems,
      repo.getCheckInForWeek,
      repo.capacityFor,
      repo.getRaces,
      repo.getPresenceStage,
    ]) {
      expect(reader).toHaveBeenCalledTimes(1);
    }
    expect(repo.getSessionsInRange).toHaveBeenCalledWith('a1', '2026-09-07', NEXT_WEEK);
    // Its ratings come from the history, as the week before the drafted one (/46).
    expect(repo.getSessionsForWeek).not.toHaveBeenCalled();
    expect(repo.getUnavailableDates).not.toHaveBeenCalled();
    expect(repo.getBriefingReflections).not.toHaveBeenCalled();
  });

  it('Coach Chat reads the unavailable dates and not the athlete row it already has', async () => {
    await readAthleteContext('a1', TODAY, chatInclude(TODAY));
    for (const reader of [
      repo.getEquipmentItems,
      repo.getCheckInForWeek,
      repo.capacityFor,
      repo.getRaces,
      repo.getPresenceStage,
      repo.getUnavailableDates,
      repo.getSessionsForWeek,
    ]) {
      expect(reader).toHaveBeenCalledTimes(1);
    }
    expect(repo.getAthleteById).not.toHaveBeenCalled();
    expect(repo.getBriefingReflections).not.toHaveBeenCalled();
    expect(repo.getSharedTranscripts).not.toHaveBeenCalled();
  });

  it('the Briefing fetches none of the athlete reports the link does not share', async () => {
    await readAthleteContext('a1', TODAY, briefingInclude(link(false, false), false));
    for (const reader of [repo.getAthleteById, repo.getBriefingReflections, repo.capacityFor, repo.getRaces]) {
      expect(reader).not.toHaveBeenCalled();
    }
    for (const reader of [repo.getEquipmentItems, repo.getCheckInForWeek, repo.getSessionsForWeek, repo.getPresenceStage]) {
      expect(reader).not.toHaveBeenCalled();
    }
  });

  it('the Briefing reads the reports when the link shares them', async () => {
    await readAthleteContext('a1', TODAY, briefingInclude(link(true, false), true));
    for (const reader of [repo.getAthleteById, repo.getBriefingReflections, repo.capacityFor, repo.getRaces]) {
      expect(reader).toHaveBeenCalledWith('a1');
    }
  });
});

describe('the ratings the draft reads (training-architecture/46)', () => {
  const rated = [
    session({ date: '2026-09-22', feedbackBody: 2, feedbackMind: 2 }),
    session({ date: '2026-09-29', feedbackBody: 4, feedbackMind: 4 }),
  ];

  it('drafts on a Monday with the ratings of the week that just ended', async () => {
    repo.getSessionsInRange.mockResolvedValue(rated.slice(0, 1));
    const ctx = await readAthleteContext('a1', THIS_WEEK, draftInclude(THIS_WEEK));
    const { lastWeekFeedback } = draftContextOf(ctx, ATHLETE, { today: THIS_WEEK, draftedWeek: THIS_WEEK });
    expect(lastWeekFeedback.weekStart).toBe('2026-09-21');
    expect(lastWeekFeedback.entries.map((f) => f.dateKey)).toEqual(['2026-09-22']);
  });

  it("drafts next week with this week's ratings", async () => {
    repo.getSessionsInRange.mockResolvedValue(rated);
    const ctx = await readAthleteContext('a1', TODAY, draftInclude(NEXT_WEEK));
    const { lastWeekFeedback } = draftContextOf(ctx, ATHLETE, { today: TODAY, draftedWeek: NEXT_WEEK });
    expect(lastWeekFeedback.weekStart).toBe(THIS_WEEK);
    expect(lastWeekFeedback.entries.map((f) => f.dateKey)).toEqual(['2026-09-29']);
  });
});

describe('the slices', () => {
  it('gives the draft the Check-in and the four weeks before the drafted week', async () => {
    repo.getSessionsInRange.mockResolvedValue([session({ date: '2026-09-22', duration: 90 })]);
    const ctx = await readAthleteContext('a1', TODAY, draftInclude(NEXT_WEEK));

    const slice = draftContextOf(ctx, ATHLETE, { today: TODAY, draftedWeek: NEXT_WEEK });

    expect(slice.checkIn.language).toBe('da');
    expect(slice.checkIn.presenceStage).toBe('building');
    expect(slice.recentWeeks.map((w) => w.weekStart)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
    expect(slice.recentWeeks[2].doneMinutes).toBe(90);
  });

  it("gives Coach Chat the Check-in in the signed-in athlete's language, and the week", async () => {
    const week = [session({ date: '2026-09-30', status: 'planned' })];
    repo.getSessionsForWeek.mockResolvedValue(week);
    const ctx = await readAthleteContext('a1', TODAY, chatInclude(TODAY));

    const slice = chatContextOf(ctx, ATHLETE, { today: TODAY, language: 'English', planWrittenAt: null });

    expect(slice.checkIn.language).toBe('English');
    expect(slice.weekSessions).toEqual(week);
  });

  it('puts a Coach with no presence evidence at cold start', async () => {
    const ctx = await readAthleteContext('a1', TODAY, { signals: [] });
    expect(chatContextOf(ctx, ATHLETE, { today: TODAY, planWrittenAt: null }).checkIn.presenceStage).toBe('cold_start');
  });

  it("says 'not recorded' for a past planned session in Coach Chat's week, and 'planned' for today's (training-architecture/45)", async () => {
    repo.getSessionsForWeek.mockResolvedValue([
      session({ id: 'mon', date: '2026-09-28', status: 'planned' }),
      session({ id: 'tue', date: TODAY, status: 'planned' }),
      session({ id: 'done', date: '2026-09-28', status: 'completed' }),
    ]);
    const ctx = await readAthleteContext('a1', TODAY, chatInclude(TODAY));

    const { weekSessions } = chatContextOf(ctx, ATHLETE, { today: TODAY, planWrittenAt: null });

    expect(weekSessions.map((s) => [s.id, s.status])).toEqual([
      ['mon', 'not recorded'],
      ['tue', 'planned'],
      ['done', 'completed'],
    ]);
  });

  it('gives the Briefing no reports and no transcripts when the link shares neither', async () => {
    const ctx = await readAthleteContext('a1', TODAY, briefingInclude(link(false, false), false));
    expect(briefingContextOf(ctx, { today: TODAY, phase: 'Base' })).toEqual({ reports: null, transcripts: null });
  });

  it('gives the Briefing the reports it may read, with a missing athlete row read as one who said nothing', async () => {
    repo.getAthleteById.mockResolvedValue(undefined);
    repo.capacityFor.mockResolvedValue('no run');
    repo.getBriefingReflections.mockResolvedValue([
      { date: '2026-09-22', type: 'Endurance', feedbackBody: 1, feedbackMind: 5, feedbackComment: 'ok' },
    ]);
    const ctx = await readAthleteContext('a1', TODAY, briefingInclude(link(true, false), true));

    const { reports } = briefingContextOf(ctx, { today: TODAY, phase: 'Base' });

    expect(reports?.profile).toMatchObject({ phase: 'Base', experienceLevel: null, capacity: 'no run', onboarding: null });
    expect(reports?.reflections).toEqual([{ date: '2026-09-22', type: 'Endurance', body: 1, mind: 10, comment: 'ok' }]);
  });

  it("gives the Briefing the athlete's own profile fields when there is a row", async () => {
    const ctx = await readAthleteContext('a1', TODAY, briefingInclude(link(true, false), true));
    const { reports } = briefingContextOf(ctx, { today: TODAY, phase: null });
    expect(reports?.profile).toMatchObject({
      experienceLevel: 'intermediate',
      raceTarget: 'Aarhus 70.3',
      sessionsPerWeek: 6,
      onboarding: { motivation: 'Completion' },
    });
  });

  it('labels each speaker in a shared transcript', async () => {
    repo.getSharedTranscripts.mockResolvedValue([
      {
        conversationId: 'c1',
        kind: 'coach_chat',
        createdAt: new Date(),
        messages: [
          { role: 'athlete', content: 'legs heavy', seq: 1 },
          { role: 'coach_ai', content: 'ease off', seq: 2 },
          { role: 'head_coach', content: 'agreed', seq: 3 },
        ],
      },
    ]);
    const ctx = await readAthleteContext('a1', TODAY, briefingInclude(link(false, true), false));
    expect(briefingContextOf(ctx, { today: TODAY, phase: null }).transcripts).toEqual([
      { kind: 'coach_chat', lines: ['Athlete: legs heavy', 'Momentum: ease off', 'Coach: agreed'] },
    ]);
  });
});
