import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const getAthleteById = vi.fn();
const getEquipmentItems = vi.fn();
const getUnavailableDates = vi.fn();
const getSessionsForWeek = vi.fn();
const capacityFor = vi.fn();
const assertAiCoachingConsent = vi.fn();
const openAiEmbedder = vi.fn();
const knowledgeSearch = vi.fn();
const retrievePassages = vi.fn();
const callCoach = vi.fn();
const getCheckInForWeek = vi.fn();
const hasHeldWeeklySessionInWeek = vi.fn();
const getResolvedBlocks = vi.fn();
// Every race the athlete has (slice 09). Empty by default: no tune-ups, no late races.
const getRaces = vi.fn(async () => []);
const getWeekDraftHistory = vi.fn();
const getCalendarProposalState = vi.fn();
const recordWeekDraft = vi.fn();
const logCoachFailure = vi.fn();
const getLinkForAthlete = vi.fn();
const getCoachByUserId = vi.fn();
const getRoster = vi.fn();

vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteById }));
vi.mock('@/features/equipment/equipment-repository', () => ({ getEquipmentItems }));
vi.mock('@/features/availability/availability-repository', () => ({ getUnavailableDates }));
vi.mock('@/features/session/session-repository', () => ({ getSessionsForWeek }));
vi.mock('@/features/health/health-repository', () => ({ capacityFor }));
vi.mock('@/features/consent/consent-gate', () => ({ assertAiCoachingConsent }));
vi.mock('@/features/knowledge-oracle/embedder', () => ({ openAiEmbedder }));
vi.mock('@/features/knowledge-oracle/knowledge-repository', () => ({ knowledgeSearch }));
vi.mock('@/features/knowledge-oracle/retrieval', () => ({ retrievePassages }));
vi.mock('./coach-client', () => ({ callCoach }));
vi.mock('./check-in-repository', () => ({ getCheckInForWeek }));
vi.mock('./conversation-repository', () => ({ hasHeldWeeklySessionInWeek }));
vi.mock('./training-block-service', () => ({ getResolvedBlocks }));
vi.mock('@/features/race/race-repository', () => ({ getRaces }));
vi.mock('./week-draft-repository', () => ({ getWeekDraftHistory, recordWeekDraft, getCalendarProposalState }));
vi.mock('@/lib/coach-log', () => ({ logCoachFailure }));
vi.mock('./coach-repository', () => ({ getLinkForAthlete, getCoachByUserId, getRoster }));

const { ensureRosterDrafted, ensureWeekDrafted, redraftWeek, draftGate, groundingQuestion, draftInFlight, slotStateFor, calendarSlotState, draftLanded } =
  await import(
  './week-draft-service',
);
const { COACH_EXPECTED_SECONDS } = await import('@/lib/generation');

const DRAFT = { id: 'd1', weekStart: '2026-09-21', visibleFrom: '2026-09-21', sessions: [], citations: [], approved: false, createdAt: new Date() };

const ATHLETE = 'athlete-1';
// 2026-09-16 is a Wednesday; the athlete's day is Wednesday, so next week is due.
const TODAY = '2026-09-16';
const NEXT_MON = '2026-09-21';

const PROPOSED = [
  { date: '2026-09-22', type: 'Endurance', durationMinutes: 60, zone: 'Z2', note: 'easy spin' },
  { date: '2026-09-23', type: 'Intensity', durationMinutes: 45, zone: 'Z4', note: 'intervals' },
  { date: '2026-09-27', type: 'Endurance', durationMinutes: 150, zone: 'Z2', note: 'long ride' },
];

function toolReply(input: unknown) {
  return { text: 'Drafted.', toolCalls: [{ name: 'propose_week_plan', input }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAthleteById.mockResolvedValue({
    id: ATHLETE,
    experienceLevel: 'intermediate',
    raceDistance: 'Ironman',
    raceTarget: 'Ironman Copenhagen',
    communicationStyle: null,
    profile: { weeklySessionDay: 'Wednesday', fixedConstraints: ['Thursday'] },
  });
  getEquipmentItems.mockResolvedValue([]);
  getUnavailableDates.mockResolvedValue([]);
  // One coach-planned session in the current week by default: the cycle rule
  // (next week) is what most of these tests are about. The this-week rule
  // (training-architecture/24) has its own block below and clears this.
  getSessionsForWeek.mockResolvedValue([{ date: '2026-09-17', origin: 'coach', type: 'Endurance', status: 'planned' }]);
  capacityFor.mockResolvedValue(null);
  assertAiCoachingConsent.mockResolvedValue({ ok: true });
  openAiEmbedder.mockReturnValue({ embed: vi.fn() });
  knowledgeSearch.mockReturnValue({ searchChunks: vi.fn() });
  retrievePassages.mockResolvedValue({
    passages: [{ text: 'Mostly easy, a little hard.', similarity: 0.7, ordinal: 1, sourceId: 's1' }],
    citations: [{ sourceId: 's1', slug: 'seiler', title: 'T', authors: 'Seiler', year: 2010, url: null, licence: 'CC BY', licenceUrl: '', attribution: 'Seiler (2010)', ordinals: [1] }],
  });
  callCoach.mockResolvedValue(toolReply({ sessions: PROPOSED }));
  getCheckInForWeek.mockResolvedValue(null);
  hasHeldWeeklySessionInWeek.mockResolvedValue(false);
  getResolvedBlocks.mockResolvedValue({
    race: { id: 'r1', name: 'Ironman Copenhagen', date: '2027-08-15', distance: 'Ironman' },
    set: null,
    blocks: [{ index: 1, total: 4, name: 'Build the Volume', startDate: '2026-09-01', endDate: '2027-01-10', authoredBy: 'coach_ai' }],
  });
  getWeekDraftHistory.mockResolvedValue({ kind: 'never' });
  recordWeekDraft.mockResolvedValue('drafted');
  getLinkForAthlete.mockResolvedValue(undefined);
  getCalendarProposalState.mockResolvedValue(null);
});

describe('draftGate — a week is drafted once (training-architecture/24)', () => {
  const window = { start: NEXT_MON, end: '2026-09-27', excludedDates: [], fellThrough: false };
  const go = { consented: true, held: false, window };

  it('goes ahead only when the week was never drafted', () => {
    expect(draftGate({ ...go, history: { kind: 'never' } })).toBeNull();
  });

  it('already-drafted for a pending, declined, written or discussing week — no decision reopens the gate', () => {
    // Pending ended at every decision and every decision reopened the gate;
    // Mads saw the same week drafted four times on 2026-09-17.
    for (const history of [
      { kind: 'pending', draft: DRAFT },
      { kind: 'declined' },
      { kind: 'written' },
      { kind: 'discussing', conversationId: 'c1' },
    ] as const) {
      expect(draftGate({ ...go, history })).toBe('already-drafted');
    }
  });

  it('the other exits keep their order: consent, held, window', () => {
    expect(draftGate({ ...go, consented: false, history: { kind: 'never' } })).toBe('consent-refused');
    expect(draftGate({ ...go, held: true, history: { kind: 'never' } })).toBe('already-held');
    expect(draftGate({ ...go, window: null, history: { kind: 'never' } })).toBe('no-window');
  });
});

describe('ensureWeekDrafted — the cheap gate calls neither the Coach nor the embedder', () => {
  it('when consent is refused', async () => {
    assertAiCoachingConsent.mockResolvedValue({ ok: false, missing: ['ai_coaching'] });
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('consent-refused');
    expect(callCoach).not.toHaveBeenCalled();
    expect(retrievePassages).not.toHaveBeenCalled();
    expect(recordWeekDraft).not.toHaveBeenCalled();
  });

  it('when a draft is already pending for the due week', async () => {
    getWeekDraftHistory.mockResolvedValue({ kind: 'pending', draft: DRAFT });
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('already-drafted');
    expect(getWeekDraftHistory).toHaveBeenCalledWith(ATHLETE, NEXT_MON);
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('after the athlete declined next week, the next open drafts nothing and calls no Coach (24)', async () => {
    getWeekDraftHistory.mockResolvedValue({ kind: 'declined' });
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('already-drafted');
    expect(callCoach).not.toHaveBeenCalled();
    expect(recordWeekDraft).not.toHaveBeenCalled();
  });

  it('when a Weekly Session was already held for that week — the athlete planned it by talking', async () => {
    hasHeldWeeklySessionInWeek.mockResolvedValue(true);
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('already-held');
    expect(hasHeldWeeklySessionInWeek).toHaveBeenCalledWith(ATHLETE, NEXT_MON);
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('when no day of the due week can hold training', async () => {
    getAthleteById.mockResolvedValue({
      id: ATHLETE,
      profile: {
        weeklySessionDay: 'Wednesday',
        fixedConstraints: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      },
    });
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('no-window');
    expect(callCoach).not.toHaveBeenCalled();
  });
});

describe('ensureWeekDrafted — a valid reply is staged once, as the Coach', () => {
  it('records one draft with the validated sessions, the citations and the week, offering exactly the propose tool', async () => {
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('drafted');

    expect(callCoach).toHaveBeenCalledTimes(1);
    const call = callCoach.mock.calls[0][0];
    expect(call.tools.map((t: { name: string }) => t.name)).toEqual(['propose_week_plan']);
    expect(call.messages).toEqual([{ role: 'user', content: "Draft next week's plan." }]);
    expect(call.system).toContain('WEEK SKELETON');
    expect(call.system).toContain('[1] Mostly easy, a little hard.');

    expect(recordWeekDraft).toHaveBeenCalledTimes(1);
    expect(recordWeekDraft.mock.calls[0][0]).toMatchObject({
      athleteId: ATHLETE,
      weekStart: NEXT_MON,
      visibleFrom: TODAY,
      sessions: PROPOSED,
      citations: [expect.objectContaining({ sourceId: 's1' })],
    });
    expect(recordWeekDraft.mock.calls[0][0].skeleton).toHaveLength(7);
  });

  it('still drafts when retrieval throws — ungrounded, said so in the prompt, and logged', async () => {
    retrievePassages.mockRejectedValue(new Error('OPENAI_API_KEY is not set'));

    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('drafted');
    expect(callCoach.mock.calls[0][0].system).toContain('No sources were retrieved for this week');
    expect(logCoachFailure).toHaveBeenCalledWith(expect.objectContaining({ surface: 'week_draft', athleteId: ATHLETE }));
    expect(recordWeekDraft.mock.calls[0][0].citations).toEqual([]);
  });

  it('asks the corpus about this athlete: distance, block and experience in the query', async () => {
    await ensureWeekDrafted(ATHLETE, TODAY);
    const query = retrievePassages.mock.calls[0][0].query;
    expect(query.question).toBe(
      'How should a Ironman triathlete structure a training week in the Build the Volume phase, week 3 of 19?',
    );
    expect(query.phase).toBe('Build the Volume');
    expect(query.experienceLevel).toBe('intermediate');
  });
});

describe('ensureWeekDrafted — the athlete is never worse off', () => {
  it('writes nothing when the Coach calls no tool, and logs week_draft', async () => {
    callCoach.mockResolvedValue({ text: 'Let me think about it.', toolCalls: [] });
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('malformed');
    expect(recordWeekDraft).not.toHaveBeenCalled();
    expect(logCoachFailure).toHaveBeenCalledWith(expect.objectContaining({ surface: 'week_draft' }));
  });

  it('writes nothing when a proposed date falls outside the window', async () => {
    callCoach.mockResolvedValue(toolReply({ sessions: [{ ...PROPOSED[0], date: '2026-10-05' }] }));
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('malformed');
    expect(recordWeekDraft).not.toHaveBeenCalled();
  });

  it('writes nothing and does not throw when the Coach call throws', async () => {
    callCoach.mockRejectedValue(new Error('503'));
    await expect(ensureWeekDrafted(ATHLETE, TODAY)).resolves.toBe('coach-failed');
    expect(recordWeekDraft).not.toHaveBeenCalled();
    expect(logCoachFailure).toHaveBeenCalledWith(expect.objectContaining({ surface: 'week_draft' }));
  });

  it('returns lost-race and does not throw when another run staged the draft first', async () => {
    recordWeekDraft.mockResolvedValue('exists');
    await expect(ensureWeekDrafted(ATHLETE, TODAY)).resolves.toBe('lost-race');
  });
});

describe('ensureWeekDrafted — an empty current week is drafted first (24, showable-version/11)', () => {
  const MON = '2026-09-14';
  const THIS_WEEK = [
    { date: '2026-09-18', type: 'Endurance', durationMinutes: 45, zone: 'Z2', note: 'easy' },
    { date: '2026-09-20', type: 'Endurance', durationMinutes: 90, zone: 'Z2', note: 'long' },
  ];
  beforeEach(() => callCoach.mockResolvedValue(toolReply({ sessions: THIS_WEEK })));

  it('drafts Wednesday–Sunday of this week, visible today, when no coach-planned session exists this week', async () => {
    getSessionsForWeek.mockResolvedValue([]);
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('drafted');
    expect(getSessionsForWeek).toHaveBeenCalledWith(ATHLETE, MON);
    expect(getWeekDraftHistory).toHaveBeenCalledWith(ATHLETE, MON);
    expect(recordWeekDraft).toHaveBeenCalledWith(expect.objectContaining({ weekStart: MON, visibleFrom: TODAY }));
    const system = callCoach.mock.calls[0][0].system;
    expect(system).toContain(`WEEK WINDOW: ${TODAY} to 2026-09-20`);
  });

  it('an athlete-added or watch-logged session does not count as a plan', async () => {
    getSessionsForWeek.mockResolvedValue([
      { date: '2026-09-15', origin: 'athlete' },
      { date: '2026-09-14', origin: 'garmin' },
    ]);
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('drafted');
    expect(recordWeekDraft).toHaveBeenCalledWith(expect.objectContaining({ weekStart: MON }));
  });

  it('with this week already drafted — pending or declined — the same open falls through to the cycle week', async () => {
    getSessionsForWeek.mockResolvedValue([]);
    callCoach.mockResolvedValue(toolReply({ sessions: PROPOSED }));
    getWeekDraftHistory.mockImplementation(async (_a: string, week: string) =>
      week === MON ? { kind: 'declined' } : { kind: 'never' },
    );
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('drafted');
    expect(getWeekDraftHistory).toHaveBeenCalledWith(ATHLETE, MON);
    expect(getWeekDraftHistory).toHaveBeenCalledWith(ATHLETE, NEXT_MON);
    expect(recordWeekDraft).toHaveBeenCalledWith(expect.objectContaining({ weekStart: NEXT_MON }));
  });

  it('the cycle week is judged on its own history, not this week’s', async () => {
    // This week holds a plan, so the cycle week is due — and that week was
    // already declined. This week's `never` must not stand in for it.
    getSessionsForWeek.mockResolvedValue([{ date: '2026-09-17', origin: 'coach' }]);
    getWeekDraftHistory.mockImplementation(async (_a: string, week: string) =>
      week === NEXT_MON ? { kind: 'declined' } : { kind: 'never' },
    );
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('already-drafted');
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('no plannable day left this week: the cycle week, as before', async () => {
    getSessionsForWeek.mockResolvedValue([]);
    callCoach.mockResolvedValue(toolReply({ sessions: PROPOSED }));
    getUnavailableDates.mockResolvedValue(['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']);
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('drafted');
    expect(recordWeekDraft).toHaveBeenCalledWith(expect.objectContaining({ weekStart: NEXT_MON }));
  });
});

describe('redraftWeek — the athlete asks once more after a decline (24)', () => {
  beforeEach(() => getSessionsForWeek.mockResolvedValue([]));

  it('drafts the declined week again, visible today, through the ordinary Coach call and write', async () => {
    getWeekDraftHistory.mockResolvedValue({ kind: 'declined' });
    expect(await redraftWeek(ATHLETE, NEXT_MON, TODAY)).toBe('drafted');
    expect(getWeekDraftHistory).toHaveBeenCalledWith(ATHLETE, NEXT_MON);
    expect(callCoach).toHaveBeenCalledTimes(1);
    expect(recordWeekDraft).toHaveBeenCalledWith(expect.objectContaining({ weekStart: NEXT_MON, visibleFrom: TODAY }));
  });

  it('refuses not-declined for a never-drafted, written or discussing week; draft-pending while one is on the table', async () => {
    for (const [history, reason] of [
      [{ kind: 'never' }, 'not-declined'],
      [{ kind: 'written' }, 'not-declined'],
      [{ kind: 'discussing', conversationId: 'c1' }, 'not-declined'],
      [{ kind: 'pending', draft: DRAFT }, 'draft-pending'],
    ] as const) {
      getWeekDraftHistory.mockResolvedValue(history);
      expect(await redraftWeek(ATHLETE, NEXT_MON, TODAY)).toBe(reason);
    }
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('refuses already-planned when a coach-planned session sits in the week, and no-window when no day can hold training', async () => {
    getWeekDraftHistory.mockResolvedValue({ kind: 'declined' });
    getSessionsForWeek.mockResolvedValue([{ date: '2026-09-22', origin: 'coach' }]);
    expect(await redraftWeek(ATHLETE, NEXT_MON, TODAY)).toBe('already-planned');
    getSessionsForWeek.mockResolvedValue([]);
    getUnavailableDates.mockResolvedValue(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
    expect(await redraftWeek(ATHLETE, NEXT_MON, TODAY)).toBe('no-window');
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('is consent-gated like the silent draft', async () => {
    getWeekDraftHistory.mockResolvedValue({ kind: 'declined' });
    assertAiCoachingConsent.mockResolvedValue({ ok: false, missing: ['ai_coaching'] });
    expect(await redraftWeek(ATHLETE, NEXT_MON, TODAY)).toBe('consent-refused');
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('never throws: a dead driver on the gate, a Coach that fails, or a refused write each become a named outcome', async () => {
    getWeekDraftHistory.mockRejectedValueOnce(new Error('driver down'));
    expect(await redraftWeek(ATHLETE, NEXT_MON, TODAY)).toBe('coach-failed');
    expect(logCoachFailure).toHaveBeenCalledWith(expect.objectContaining({ surface: 'week_draft', athleteId: ATHLETE }));

    getWeekDraftHistory.mockResolvedValue({ kind: 'declined' });
    callCoach.mockRejectedValueOnce(new Error('upstream'));
    expect(await redraftWeek(ATHLETE, NEXT_MON, TODAY)).toBe('coach-failed');

    recordWeekDraft.mockResolvedValueOnce('exists');
    expect(await redraftWeek(ATHLETE, NEXT_MON, TODAY)).toBe('lost-race');

    recordWeekDraft.mockRejectedValueOnce(new Error('insert failed'));
    expect(await redraftWeek(ATHLETE, NEXT_MON, TODAY)).toBe('coach-failed');
  });
});

describe('ensureWeekDrafted — the edges', () => {
  it('drafts for an athlete with no profile at all: Sunday cycle, no recurring no-train days in the prompt', async () => {
    getAthleteById.mockResolvedValue({ id: ATHLETE, profile: null, experienceLevel: null, raceDistance: null });
    getResolvedBlocks.mockResolvedValue({ race: null, set: null, blocks: [] });
    expect(await ensureWeekDrafted(ATHLETE, '2026-09-20')).toBe('drafted');
    const system = callCoach.mock.calls[0][0].system;
    expect(system).not.toContain('RECURRING NO-TRAIN DAYS');
    expect(system).toContain('WEEK WINDOW: 2026-09-21 to 2026-09-27');
    // No block → the corpus is asked the no-race question, with no phase.
    const query = retrievePassages.mock.calls[0][0].query;
    expect(query).toEqual({ question: 'How should a triathlete structure a training week with no race booked?', phase: undefined, experienceLevel: undefined });
  });

  it('reads a missing athlete row or profile as no day and no constraints: Sunday, whole week', async () => {
    // 2026-09-20 is a Sunday: with no day stored the cycle is anchored there.
    getAthleteById.mockResolvedValueOnce(undefined).mockResolvedValue({ id: ATHLETE, profile: null });
    hasHeldWeeklySessionInWeek.mockResolvedValue(true);
    expect(await ensureWeekDrafted(ATHLETE, '2026-09-20')).toBe('already-held');
    expect(getWeekDraftHistory).toHaveBeenCalledWith(ATHLETE, NEXT_MON);
  });

  it('fails as coach-failed, logged, when the athlete row vanishes between the gate and the briefing', async () => {
    getAthleteById.mockResolvedValueOnce({ id: ATHLETE, profile: { weeklySessionDay: 'Wednesday' } }).mockResolvedValueOnce(undefined);
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('coach-failed');
    expect(callCoach).not.toHaveBeenCalled();
    const logged = logCoachFailure.mock.calls[0][0];
    expect(logged.surface).toBe('week_draft');
    expect((logged.error as Error).message).toBe('athlete row missing');
  });

  it('treats a call to some other tool as no tool call, and says so in the log', async () => {
    callCoach.mockResolvedValue({ text: '', toolCalls: [{ name: 'look_up_training_science', input: {} }] });
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('malformed');
    expect((logCoachFailure.mock.calls[0][0].error as Error).message).toBe('no tool call');
  });

  it('names the validator’s reason when the proposal is refused', async () => {
    callCoach.mockResolvedValue(toolReply({ sessions: [] }));
    expect(await ensureWeekDrafted(ATHLETE, TODAY)).toBe('malformed');
    expect((logCoachFailure.mock.calls[0][0].error as Error).message).toBe('proposal refused: empty');
  });

  it('asks one fixed question per situation', () => {
    expect(groundingQuestion({ distance: 'Ironman', phase: 'Build the Volume', position: { week: 3, weeks: 8 } })).toBe(
      'How should a Ironman triathlete structure a training week in the Build the Volume phase, week 3 of 8?',
    );
    expect(groundingQuestion({ distance: 'Ironman', phase: 'Build the Volume', position: null })).toBe(
      'How should a Ironman triathlete structure a training week in the Build the Volume phase?',
    );
    expect(groundingQuestion({ position: null })).toBe(
      'How should a triathlete structure a training week with no race booked?',
    );
  });
});

describe('ensureWeekDrafted — a linked Head Coach sees the draft a day early (training-architecture/17)', () => {
  // The athlete's day is Wednesday. On Tuesday the 15th the solo cycle is
  // last Wednesday's (this week, already begun); with a link the Wednesday
  // cycle is already current, so next week is drafted — and stamped visible
  // from Wednesday, the athlete's own day.
  it('drafts a day early and stamps visibleFrom as the athlete’s day when a link is active', async () => {
    getLinkForAthlete.mockResolvedValue({ headCoachName: 'Lars', link: { status: 'active' } });
    expect(await ensureWeekDrafted(ATHLETE, '2026-09-15')).toBe('drafted');
    expect(getWeekDraftHistory).toHaveBeenCalledWith(ATHLETE, NEXT_MON);
    expect(recordWeekDraft.mock.calls[0][0]).toMatchObject({ weekStart: NEXT_MON, visibleFrom: '2026-09-16' });
  });

  it('with no link the same Tuesday is still last week’s cycle, visible from that day', async () => {
    hasHeldWeeklySessionInWeek.mockResolvedValue(true);
    expect(await ensureWeekDrafted(ATHLETE, '2026-09-15')).toBe('already-held');
    expect(getWeekDraftHistory).toHaveBeenCalledWith(ATHLETE, '2026-09-14');
  });

  it('on the day itself a solo athlete’s draft is visible from that day', async () => {
    await ensureWeekDrafted(ATHLETE, TODAY);
    expect(recordWeekDraft.mock.calls[0][0]).toMatchObject({ visibleFrom: TODAY });
  });
});

describe('ensureWeekDrafted — the boundary holds to the last write', () => {
  it('a throwing recordWeekDraft is coach-failed and logged, never a thrown promise', async () => {
    // The service promises never to throw. The final insert sat outside the
    // boundary; a dead driver there would have ended a roster loop at this
    // athlete and reached the shell's after() as a rejection. CodeRabbit, PR #69.
    recordWeekDraft.mockRejectedValueOnce(new Error('driver down'));
    await expect(ensureWeekDrafted(ATHLETE, TODAY)).resolves.toBe('coach-failed');
    expect(logCoachFailure).toHaveBeenCalledWith(expect.objectContaining({ surface: 'week_draft', athleteId: ATHLETE }));
  });
});

describe('ensureRosterDrafted — the Head Coach’s app-open drafts for every linked athlete (16, 17)', () => {
  // Issue 16: "whoever opens the app first on or after the due day triggers
  // it, coach or athlete." 17's whole point is that the coach sees the draft a
  // day before the athlete, and on that day the athlete has no reason to open
  // the app. So the coach's open has to be a trigger too, for each athlete on
  // their roster — one draft per athlete, each through the same gate.
  beforeEach(() => {
    getCoachByUserId.mockResolvedValue({ id: 'coach_1' });
    getRoster.mockResolvedValue([{ athleteId: ATHLETE }, { athleteId: 'athlete_2' }]);
    getLinkForAthlete.mockResolvedValue({ headCoachName: 'Lars', link: { status: 'active' } });
  });

  it('runs the gate once per roster athlete and returns each outcome by athlete', async () => {
    getWeekDraftHistory.mockImplementation(async (id: string) => (id === 'athlete_2' ? { kind: 'pending', draft: DRAFT } : { kind: 'never' }));
    const outcomes = await ensureRosterDrafted('user_coach', '2026-09-15');
    expect(outcomes).toEqual({ [ATHLETE]: 'drafted', athlete_2: 'already-drafted' });
    expect(recordWeekDraft).toHaveBeenCalledTimes(1);
    expect(recordWeekDraft.mock.calls[0][0]).toMatchObject({ athleteId: ATHLETE, weekStart: NEXT_MON });
  });

  it('is nothing for a user with no coach row, and reads no roster', async () => {
    getCoachByUserId.mockResolvedValue(undefined);
    expect(await ensureRosterDrafted('user_plain', '2026-09-15')).toEqual({});
    expect(getRoster).not.toHaveBeenCalled();
  });

  it('a throwing roster read is nothing, not an unhandled rejection in the shell’s after()', async () => {
    getRoster.mockRejectedValueOnce(new Error('driver down'));
    await expect(ensureRosterDrafted('user_coach', '2026-09-15')).resolves.toEqual({});
  });

  it('a throwing coach lookup is nothing too', async () => {
    getCoachByUserId.mockRejectedValueOnce(new Error('driver down'));
    await expect(ensureRosterDrafted('user_coach', '2026-09-15')).resolves.toEqual({});
    expect(getRoster).not.toHaveBeenCalled();
  });

  it('one athlete’s failure does not stop the next — the outcome names it and the loop goes on', async () => {
    getAthleteById.mockImplementation(async (id: string) => {
      if (id === ATHLETE) throw new Error('driver down');
      return { id, profile: { weeklySessionDay: 'Wednesday', fixedConstraints: [] } };
    });
    const outcomes = await ensureRosterDrafted('user_coach', '2026-09-15');
    expect(outcomes[ATHLETE]).toBe('coach-failed');
    expect(outcomes.athlete_2).toBe('drafted');
  });
});

describe('the draft never reaches the calendar', () => {
  it('week-draft-service.ts imports neither the plan writer nor the sessions table', () => {
    const source = readFileSync(fileURLToPath(new URL('./week-draft-service.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/replaceCoachPlanForDateRange/);
    expect(source).not.toMatch(/\bsessions\b[^\n]*from '@\/db\/schema'/);
    expect(source).not.toMatch(/from '@\/db'/);
  });
});

describe('draftInFlight — derived, never stored (training-architecture/29)', () => {
  const MON = '2026-09-14';
  const ALL_DAYS_OF_NEXT_WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];

  it('names the due week and the estimate when the gate would draft and nothing is recorded, without calling the Coach', async () => {
    expect(await draftInFlight(ATHLETE, TODAY)).toEqual({ weekStart: NEXT_MON, visibleFrom: TODAY, expectedSeconds: COACH_EXPECTED_SECONDS });
    expect(callCoach).not.toHaveBeenCalled();
    expect(recordWeekDraft).not.toHaveBeenCalled();
  });

  it('is this week, visible today, for a new athlete with an empty current week', async () => {
    getSessionsForWeek.mockResolvedValue([]);
    expect(await draftInFlight(ATHLETE, TODAY)).toMatchObject({ weekStart: MON, visibleFrom: TODAY });
  });

  it('null once a draft is recorded, decided or discussed — the gate would not draft', async () => {
    for (const history of [
      { kind: 'pending', draft: DRAFT },
      { kind: 'declined' },
      { kind: 'written' },
      { kind: 'discussing', conversationId: 'c1' },
    ] as const) {
      getWeekDraftHistory.mockResolvedValue(history);
      expect(await draftInFlight(ATHLETE, TODAY)).toBeNull();
    }
  });

  it('null when consent is missing, the week is held, or no day can hold training', async () => {
    assertAiCoachingConsent.mockResolvedValueOnce({ ok: false, missing: ['ai_coaching'] });
    expect(await draftInFlight(ATHLETE, TODAY)).toBeNull();
    hasHeldWeeklySessionInWeek.mockResolvedValueOnce(true);
    expect(await draftInFlight(ATHLETE, TODAY)).toBeNull();
    getUnavailableDates.mockResolvedValueOnce(ALL_DAYS_OF_NEXT_WEEK);
    expect(await draftInFlight(ATHLETE, TODAY)).toBeNull();
  });

  it('a dead driver reads as nothing in flight, logged, never thrown', async () => {
    getAthleteById.mockRejectedValueOnce(new Error('driver down'));
    expect(await draftInFlight(ATHLETE, TODAY)).toBeNull();
    expect(logCoachFailure).toHaveBeenCalledWith(expect.objectContaining({ surface: 'week_draft', athleteId: ATHLETE }));
  });
});

describe('calendarSlotState — the slot says a draft is coming (29)', () => {
  it('slotStateFor: a proposal state wins; an in-flight draft the athlete may see is drafting; a lead-day draft is nothing', () => {
    const proposal = { kind: 'redraft-offer', weekStart: NEXT_MON } as const;
    const inFlight = { weekStart: NEXT_MON, visibleFrom: TODAY, expectedSeconds: 30 };
    expect(slotStateFor(proposal, inFlight, TODAY)).toEqual(proposal);
    expect(slotStateFor(null, inFlight, TODAY)).toEqual({ kind: 'drafting', weekStart: NEXT_MON });
    expect(slotStateFor(null, { ...inFlight, visibleFrom: '2026-09-17' }, TODAY)).toBeNull();
    expect(slotStateFor(null, null, TODAY)).toBeNull();
  });

  it('reads the proposal state first and asks the gate only when there is none', async () => {
    getCalendarProposalState.mockResolvedValue({ kind: 'discussing', conversationId: 'c1', weekStart: NEXT_MON });
    expect(await calendarSlotState(ATHLETE, TODAY)).toEqual({ kind: 'discussing', conversationId: 'c1', weekStart: NEXT_MON });
    expect(getAthleteById).not.toHaveBeenCalled();
    getCalendarProposalState.mockResolvedValue(null);
    expect(await calendarSlotState(ATHLETE, TODAY)).toEqual({ kind: 'drafting', weekStart: NEXT_MON });
  });
});

describe('draftLanded — the poll’s read (29, review)', () => {
  it('true once any draft is recorded for the week, false while none is, and false on a dead driver', async () => {
    getWeekDraftHistory.mockResolvedValue({ kind: 'pending', draft: DRAFT });
    expect(await draftLanded(ATHLETE, NEXT_MON)).toBe(true);
    expect(getWeekDraftHistory).toHaveBeenCalledWith(ATHLETE, NEXT_MON);
    getWeekDraftHistory.mockResolvedValue({ kind: 'never' });
    expect(await draftLanded(ATHLETE, NEXT_MON)).toBe(false);
    getWeekDraftHistory.mockRejectedValueOnce(new Error('driver down'));
    expect(await draftLanded(ATHLETE, NEXT_MON)).toBe(false);
    expect(logCoachFailure).toHaveBeenCalledWith(expect.objectContaining({ surface: 'week_draft', athleteId: ATHLETE }));
  });
});
