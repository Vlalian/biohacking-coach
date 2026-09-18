import { describe, it, expect, vi, beforeEach } from 'vitest';
import { capacityStatement } from '@/features/health/capacity';

const {
  capacityFor,
  getActiveLink,
  getSharedTranscripts,
  getAthleteById,
  getPreferredNameForAthlete,
  getBriefingPlan,
  getBriefingReflections,
  callCoach,
  createBriefing,
  getOwnedBriefing,
  getLatestBriefingWithMessages,
  appendBriefingMessages,
  getMessages,
} = vi.hoisted(() => ({
  capacityFor: vi.fn<() => Promise<string | null>>(async () => null),
  getActiveLink: vi.fn(),
  getSharedTranscripts: vi.fn((): Promise<unknown[] | null> => Promise.resolve(null)),
  getAthleteById: vi.fn(),
  getPreferredNameForAthlete: vi.fn((): Promise<string | null> => Promise.resolve(null)),
  getBriefingPlan: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
  getBriefingReflections: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
  callCoach: vi.fn<
    (input: { system: string; messages: unknown; maxTokens: number }) => Promise<{
      text: string;
      toolCalls: unknown[];
    }>
  >(() => Promise.resolve({ text: 'my read', toolCalls: [] })),
  createBriefing: vi.fn(),
  getOwnedBriefing: vi.fn(),
  getLatestBriefingWithMessages: vi.fn((): Promise<unknown> => Promise.resolve(null)),
  appendBriefingMessages: vi.fn((): Promise<unknown[] | null> => Promise.resolve(null)),
  getMessages: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
}));

vi.mock('./coach-repository', () => ({ getActiveLink, getSharedTranscripts }));
vi.mock('@/features/health/health-repository', () => ({ capacityFor }));
const { getTargetRace, getRaces } = vi.hoisted(() => ({
  // No Target Race: the Head Coach's briefing has to render an athlete with no
  // horizon, and the Training Phase is derived from it rather than stored.
  getTargetRace: vi.fn<() => Promise<unknown>>(async () => null),
  getRaces: vi.fn<() => Promise<unknown[]>>(async () => []),
}));
vi.mock('@/features/race/race-repository', () => ({ getTargetRace, getRaces }));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteById }));
vi.mock('@/features/user-prefs/user-prefs-repository', () => ({ getPreferredNameForAthlete }));
vi.mock('@/features/session/session-repository', () => ({
  getBriefingPlan,
  getBriefingReflections,
}));
vi.mock('./coach-client', () => ({ callCoach, EmptyCoachReplyError: class EmptyCoachReplyError extends Error {} }));
const { getResolvedBlocks, getLatestUnrealisticFlag } = vi.hoisted(() => ({
  getResolvedBlocks: vi.fn(async (): Promise<unknown> => ({ race: null, set: null, blocks: [] })),
  getLatestUnrealisticFlag: vi.fn(async (): Promise<string | null> => null),
}));
vi.mock('./training-block-service', () => ({ getResolvedBlocks }));
vi.mock('./training-block-repository', () => ({ getLatestUnrealisticFlag }));
vi.mock('./conversation-repository', () => ({
  createBriefing,
  getOwnedBriefing,
  getLatestBriefingWithMessages,
  appendBriefingMessages,
  getMessages,
}));

const { startBriefing, continueBriefing } = await import('./briefing-service');

const TODAY = '2026-08-08';

/** An active Coaching Link with the given flags. */
const activeLink = (shareAthleteReports: boolean, shareAiTranscripts: boolean) => ({
  id: 'l1',
  coachId: 'coach_1',
  athleteId: 'a1',
  status: 'active' as const,
  visibility: { shareAthleteReports, shareAiTranscripts },
});

/** The system prompt handed to the model on the most recent callCoach call. */
const lastSystem = (): string => callCoach.mock.calls.at(-1)![0].system as string;

beforeEach(() => {
  vi.clearAllMocks();
  getSharedTranscripts.mockResolvedValue(null);
  getBriefingPlan.mockResolvedValue([]);
  getBriefingReflections.mockResolvedValue([]);
  getLatestBriefingWithMessages.mockResolvedValue(null);
  callCoach.mockResolvedValue({ text: 'my read', toolCalls: [] });
  createBriefing.mockResolvedValue({ id: 'b1', athleteId: 'a1', coachId: 'coach_1', kind: 'coach_briefing' });
  appendBriefingMessages.mockResolvedValue([
    { id: 'm0', role: 'coach_ai', content: 'my read', seq: 0, createdAt: new Date() },
  ]);
  getMessages.mockResolvedValue([]);
});

describe('startBriefing — the Preferred Name (preferred-name/02)', () => {
  it('refers to the athlete by the name they chose, read through the user seam for the linked athlete', async () => {
    getActiveLink.mockResolvedValue(activeLink(false, false));
    getPreferredNameForAthlete.mockResolvedValue('Mads');

    await startBriefing('coach_1', 'a1', TODAY);

    expect(getPreferredNameForAthlete).toHaveBeenCalledWith('a1');
    expect(lastSystem()).toContain('by the name they chose, "Mads"');
  });

  it('keeps the nameless third person when the athlete chose none', async () => {
    getActiveLink.mockResolvedValue(activeLink(false, false));
    getPreferredNameForAthlete.mockResolvedValue(null);

    await startBriefing('coach_1', 'a1', TODAY);

    expect(lastSystem()).toContain('never use a real name');
  });
});

describe('startBriefing — the link gate', () => {
  it('refuses when no active link joins the coach to the athlete, reading nothing', async () => {
    getActiveLink.mockResolvedValue(undefined);

    const result = await startBriefing('coach_1', 'a_stranger', TODAY);

    expect(result).toEqual({ ok: false, reason: 'not-linked' });
    // Total refusal: no material fetched, no briefing created, no model call.
    expect(createBriefing).not.toHaveBeenCalled();
    expect(getBriefingPlan).not.toHaveBeenCalled();
    expect(getAthleteById).not.toHaveBeenCalled();
    expect(getBriefingReflections).not.toHaveBeenCalled();
    expect(getSharedTranscripts).not.toHaveBeenCalled();
    expect(callCoach).not.toHaveBeenCalled();
  });
});

describe('startBriefing — reports gated on shareAthleteReports (prompt material)', () => {
  it('reports ON: the athlete profile and reflections feed the prompt', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    getAthleteById.mockResolvedValue({
      experienceLevel: 'intermediate',
      raceTarget: 'IM Copenhagen',
      trainingSessionsPerWeek: 6,
      profile: { onboarding: null },
    });
    getBriefingReflections.mockResolvedValue([
      { date: '2026-08-04', type: 'Endurance', feedbackBody: 5, feedbackMind: 5, feedbackComment: 'strong ride' },
    ]);

    const result = await startBriefing('coach_1', 'a1', TODAY);

    expect(result.ok).toBe(true);
    // The gated fetches ran because the flag is on.
    expect(getAthleteById).toHaveBeenCalledWith('a1');
    expect(getBriefingReflections).toHaveBeenCalledWith('a1');
    // And the material reached the prompt.
    expect(lastSystem()).toContain('strong ride');
    expect(lastSystem()).toContain('IM Copenhagen');
    expect(lastSystem()).not.toContain('has not shared their reflections');
  });

  it('reports OFF: the profile and reflections are never fetched, and the prompt says withheld', async () => {
    getActiveLink.mockResolvedValue(activeLink(false, false));

    const result = await startBriefing('coach_1', 'a1', TODAY);

    expect(result.ok).toBe(true);
    // Not fetched-then-hidden — not fetched at all (slice 13 AC).
    expect(getAthleteById).not.toHaveBeenCalled();
    expect(getBriefingReflections).not.toHaveBeenCalled();
    expect(lastSystem()).toContain('has not shared their reflections');
  });
});

describe('startBriefing — transcripts gated on shareAiTranscripts (prompt material)', () => {
  it('transcripts ON: the shared conversations feed the prompt', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, true));
    getSharedTranscripts.mockResolvedValue([
      { conversationId: 'c1', kind: 'coach_chat', createdAt: new Date(), messages: [{ role: 'athlete', content: 'I felt tired', seq: 0 }] },
    ]);

    const result = await startBriefing('coach_1', 'a1', TODAY);

    expect(result.ok).toBe(true);
    expect(getSharedTranscripts).toHaveBeenCalledWith(activeLink(true, true));
    expect(lastSystem()).toContain('ATHLETE CONVERSATIONS');
    expect(lastSystem()).toContain('I felt tired');
  });

  it('transcripts OFF: getSharedTranscripts withholds (null) and the prompt says so', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    getSharedTranscripts.mockResolvedValue(null);

    const result = await startBriefing('coach_1', 'a1', TODAY);

    expect(result.ok).toBe(true);
    expect(lastSystem()).toContain('has not shared their private Coach Chat');
    expect(lastSystem()).not.toContain('I felt tired');
  });
});

describe('startBriefing — persistence', () => {
  it('creates the briefing and persists the Coach\'s opening turn', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));

    const result = await startBriefing('coach_1', 'a1', TODAY);

    expect(createBriefing).toHaveBeenCalledWith({ coachId: 'coach_1', athleteId: 'a1' });
    expect(appendBriefingMessages).toHaveBeenCalledWith('coach_1', 'b1', [
      { role: 'coach_ai', content: 'my read' },
    ]);
    expect(result.ok && result.conversationId).toBe('b1');
  });

  it('resumes an existing briefing instead of opening a second (no duplicate, no model call)', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    getLatestBriefingWithMessages.mockResolvedValue({
      conversation: { id: 'b_existing', athleteId: 'a1', coachId: 'coach_1', kind: 'coach_briefing' },
      messages: [{ id: 'm0', role: 'coach_ai', content: 'earlier read', seq: 0, createdAt: new Date() }],
    });

    const result = await startBriefing('coach_1', 'a1', TODAY);

    expect(result).toEqual({
      ok: true,
      conversationId: 'b_existing',
      messages: [{ id: 'm0', role: 'coach_ai', content: 'earlier read', seq: 0, createdAt: expect.any(Date) }],
    });
    // No second briefing row, and no wasted model call — the channel is one thread.
    expect(createBriefing).not.toHaveBeenCalled();
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('surfaces a persistence failure rather than a blank-but-ok briefing', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    // appendBriefingMessages returning null must never be laundered into ok:[].
    appendBriefingMessages.mockResolvedValue(null);

    const result = await startBriefing('coach_1', 'a1', TODAY);

    expect(result).toEqual({ ok: false, reason: 'failed' });
  });

  it('calls the model before creating the conversation, so a failed call leaves no empty row', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    callCoach.mockRejectedValue(new Error('anthropic down'));

    // Returned now, not thrown: `callCoach` refuses an empty turn as well as an
    // unreachable API, and a Head Coach staring at a rejected server action
    // learns nothing. The row must still not exist either way.
    const result = await startBriefing('coach_1', 'a1', TODAY);

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
    expect(createBriefing).not.toHaveBeenCalled();
    expect(appendBriefingMessages).not.toHaveBeenCalled();
  });
});

describe('continueBriefing — the gates', () => {
  it('refuses an empty message', async () => {
    const result = await continueBriefing('coach_1', 'b1', '   ', TODAY);
    expect(result).toEqual({ ok: false, reason: 'empty' });
    expect(getOwnedBriefing).not.toHaveBeenCalled();
  });

  it('refuses a briefing the coach does not own, without calling the model', async () => {
    getOwnedBriefing.mockResolvedValue(null);

    const result = await continueBriefing('coach_2', 'b1', 'brief me', TODAY);

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(getActiveLink).not.toHaveBeenCalled();
    expect(appendBriefingMessages).not.toHaveBeenCalled();
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('refuses when the link has been severed since the briefing opened', async () => {
    getOwnedBriefing.mockResolvedValue({ id: 'b1', athleteId: 'a1', coachId: 'coach_1', kind: 'coach_briefing' });
    getActiveLink.mockResolvedValue(undefined); // severed since

    const result = await continueBriefing('coach_1', 'b1', 'brief me', TODAY);

    expect(result).toEqual({ ok: false, reason: 'not-linked' });
    expect(appendBriefingMessages).not.toHaveBeenCalled();
    expect(callCoach).not.toHaveBeenCalled();
  });

  it('appends the Head Coach turn and the reply on the happy path', async () => {
    getOwnedBriefing.mockResolvedValue({ id: 'b1', athleteId: 'a1', coachId: 'coach_1', kind: 'coach_briefing' });
    getActiveLink.mockResolvedValue(activeLink(true, false));
    appendBriefingMessages.mockResolvedValue([
      { id: 'm1', role: 'head_coach', content: 'how is her sleep?', seq: 1, createdAt: new Date() },
    ]);
    getMessages.mockResolvedValue([
      { id: 'm1', role: 'head_coach', content: 'how is her sleep?', seq: 1, createdAt: new Date() },
    ]);

    const result = await continueBriefing('coach_1', 'b1', 'how is her sleep?', TODAY);

    expect(result.ok).toBe(true);
    // Both turns land in ONE append, after the Coach has answered. Storing the
    // Head Coach's question first left it stranded with no answer whenever the
    // call failed, and a retry would have posted it twice.
    expect(appendBriefingMessages).toHaveBeenCalledTimes(1);
    expect(appendBriefingMessages).toHaveBeenCalledWith('coach_1', 'b1', [
      { role: 'head_coach', content: 'how is her sleep?' },
      { role: 'coach_ai', content: 'my read' },
    ]);
  });

  it('writes nothing when the Coach turn fails — the Briefing path had the same bug', async () => {
    getOwnedBriefing.mockResolvedValue({ id: 'b1', athleteId: 'a1', coachId: 'coach_1', kind: 'coach_briefing' });
    getActiveLink.mockResolvedValue(activeLink(true, false));
    callCoach.mockRejectedValue(new Error('empty turn'));

    const result = await continueBriefing('coach_1', 'b1', 'how is her sleep?', TODAY);

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
    expect(appendBriefingMessages).not.toHaveBeenCalled();
  });
});


describe('an open Injury is athlete-reported data, gated by the same flag', () => {
  const OPEN_INJURY = capacityStatement(
    [{ capacity: { swim: 'full', bike: 'easy', run: 'none' } }],
    false,
  );

  it("reaches a Head Coach who may see the athlete's reports", async () => {
    // `training-architecture/04`: visible "within existing Link Visibility
    // rules". It belongs to `shareAthleteReports` alongside Session Reflections
    // and Check-ins — the same flag, deliberately not a third one.
    getActiveLink.mockResolvedValue(activeLink(true, false));
    capacityFor.mockResolvedValue(OPEN_INJURY);

    await startBriefing('coach_1', 'a1', TODAY);

    const { system } = callCoach.mock.calls[0][0];
    expect(system).toContain('no run');
    expect(system).toContain('bike easy only');
  });

  it('is never fetched at all when reports are not shared', async () => {
    // Withheld by not reading it, not by reading it and hiding it — Link
    // Visibility is enforced at the network layer (ticket 11), so the data must
    // not cross to the client in the first place.
    getActiveLink.mockResolvedValue(activeLink(false, false));
    capacityFor.mockResolvedValue(OPEN_INJURY);

    await startBriefing('coach_1', 'a1', TODAY);

    expect(capacityFor).not.toHaveBeenCalled();
    expect(callCoach.mock.calls[0][0].system).not.toContain('no run');
  });
});

describe('startBriefing — the prompt material the rest of the suite does not reach', () => {
  it('carries the resolved Training Blocks, their authors and the unrealistic flag (training-architecture/07)', async () => {
    getActiveLink.mockResolvedValue(activeLink(false, false));
    getResolvedBlocks.mockResolvedValue({
      race: { id: 'r1', name: 'IM', date: '2027-08-15' },
      set: null,
      blocks: [
        { index: 1, total: 2, name: 'Build the Volume', startDate: '2026-06-01', endDate: '2026-07-31', authoredBy: 'coach_ai' },
        { index: 2, total: 2, name: 'Long Rides', startDate: '2026-08-01', endDate: '2027-08-15', authoredBy: 'head_coach' },
      ],
    });
    getLatestUnrealisticFlag.mockResolvedValue('eleven months is short');

    await startBriefing('coach_1', 'a1', TODAY);

    expect(getResolvedBlocks).toHaveBeenCalledWith('a1', TODAY);
    expect(getLatestUnrealisticFlag).toHaveBeenCalledWith('a1', 'r1');
    expect(lastSystem()).toContain('Build the Volume · to 2026-07-31 · Coach');
    expect(lastSystem()).toContain('Long Rides · to 2027-08-15 · Head Coach');
    expect(lastSystem()).toContain("The Training Blocks are the Head Coach's.");
    expect(lastSystem()).toContain('flagged the Target Race as unrealistic: eleven months is short');
    // Reports withheld, and the blocks rendered anyway: they are plan structure.
    expect(lastSystem()).toContain('withheld');
    // ...including which block is now — the profile's phase line is gone with
    // the reports, so the block list has to say it (CodeRabbit, PR #65).
    expect(lastSystem()).toContain('Long Rides · to 2027-08-15 · Head Coach · current');
  });

  it('reads no verdict at all for an athlete with no Target Race', async () => {
    getActiveLink.mockResolvedValue(activeLink(false, false));
    getResolvedBlocks.mockResolvedValue({ race: null, set: null, blocks: [] });
    getLatestUnrealisticFlag.mockClear();

    await startBriefing('coach_1', 'a1', TODAY);

    expect(getLatestUnrealisticFlag).not.toHaveBeenCalled();
    expect(lastSystem()).toContain('TRAINING BLOCKS: none');
  });

  it('names the phase from the resolved block today falls inside', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    getAthleteById.mockResolvedValue({ experienceLevel: 'intermediate', raceTarget: null, trainingSessionsPerWeek: null, profile: null });
    getResolvedBlocks.mockResolvedValue({
      race: { id: 'r1', name: 'IM', date: '2027-08-15' },
      set: null,
      blocks: [
        { index: 1, total: 2, name: 'Build the Volume', startDate: '2026-08-01', endDate: '2026-12-31', authoredBy: 'coach_ai' },
        { index: 2, total: 2, name: 'Taper', startDate: '2027-01-01', endDate: '2027-08-15', authoredBy: 'coach_ai' },
      ],
    });

    await startBriefing('coach_1', 'a1', TODAY);

    expect(lastSystem()).toContain('Training phase: Build the Volume');
  });

  it('renders a profile with no athlete row as absent fields, not a crash', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    getAthleteById.mockResolvedValue(undefined);

    const result = await startBriefing('coach_1', 'a1', TODAY);

    expect(result.ok).toBe(true);
    expect(lastSystem()).not.toContain('Experience:');
    expect(lastSystem()).not.toContain('Race target:');
    expect(lastSystem()).not.toContain('Training sessions per week');
  });

  it('labels all three speakers in a shared transcript', async () => {
    getActiveLink.mockResolvedValue(activeLink(false, true));
    getSharedTranscripts.mockResolvedValue([
      {
        conversationId: 'c1',
        kind: 'weekly_session',
        createdAt: new Date(),
        messages: [
          { role: 'athlete', content: 'tired', seq: 0 },
          { role: 'coach_ai', content: 'rest', seq: 1 },
          { role: 'head_coach', content: 'agreed', seq: 2 },
        ],
      },
    ]);

    await startBriefing('coach_1', 'a1', TODAY);

    expect(lastSystem()).toContain('[Weekly Session]\nAthlete: tired\nCoach: rest\nHead Coach: agreed');
  });

  it('opens with the fixed primer and the briefing token budget', async () => {
    getActiveLink.mockResolvedValue(activeLink(false, false));

    await startBriefing('coach_1', 'a1', TODAY, 'da');

    const call = callCoach.mock.calls[0][0];
    expect(call.messages).toEqual([{ role: 'user', content: "Brief me on this athlete." }]);
    expect(call.maxTokens).toBe(1400);
    expect(call.system).toContain('Danish');
  });
});

describe('continueBriefing — the failure log', () => {
  it('logs the failed turn against the briefing surface with the refusal reason', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getOwnedBriefing.mockResolvedValue({ id: 'b1', athleteId: 'a1', coachId: 'coach_1', kind: 'coach_briefing' });
    getActiveLink.mockResolvedValue(activeLink(true, false));
    callCoach.mockRejectedValue(new Error('empty turn'));

    await continueBriefing('coach_1', 'b1', 'how is her sleep?', TODAY);

    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({
      event: 'coach_call_failed',
      surface: 'coach_briefing',
      athleteId: 'a1',
      conversationId: 'b1',
      reason: 'coach-unavailable',
    });
    spy.mockRestore();
  });

  it('sends the whole transcript plus the new turn, in order', async () => {
    getOwnedBriefing.mockResolvedValue({ id: 'b1', athleteId: 'a1', coachId: 'coach_1', kind: 'coach_briefing' });
    getActiveLink.mockResolvedValue(activeLink(false, false));
    getMessages.mockResolvedValue([
      { id: 'm0', role: 'coach_ai', content: 'my read', seq: 0, createdAt: new Date() },
    ]);

    await continueBriefing('coach_1', 'b1', '  how is her sleep?  ', TODAY);

    const call = callCoach.mock.calls[0][0];
    expect((call.messages as { role: string; content: string }[]).at(-1)).toEqual({ role: 'user', content: 'how is her sleep?' });
    expect(call.maxTokens).toBe(1400);
    expect(appendBriefingMessages).toHaveBeenCalledWith('coach_1', 'b1', [
      { role: 'head_coach', content: 'how is her sleep?' },
      { role: 'coach_ai', content: 'my read' },
    ]);
  });
});

describe('the two remaining refusals and the opening log', () => {
  it('reads a zero-per-week athlete as zero, not as unknown', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    getAthleteById.mockResolvedValue({ experienceLevel: 'novice', raceTarget: null, trainingSessionsPerWeek: 0, profile: { onboarding: { motivation: 'finish' } } });

    await startBriefing('coach_1', 'a1', TODAY);

    expect(lastSystem()).toContain('Training sessions per week: 0');
    expect(lastSystem()).toContain('Motivation: finish');
  });

  it('refuses continue as not-owner when the append finds the briefing is no longer this coach’s', async () => {
    getOwnedBriefing.mockResolvedValue({ id: 'b1', athleteId: 'a1', coachId: 'coach_1', kind: 'coach_briefing' });
    getActiveLink.mockResolvedValue(activeLink(false, false));
    appendBriefingMessages.mockResolvedValue(null);

    expect(await continueBriefing('coach_1', 'b1', 'still there?', TODAY)).toEqual({ ok: false, reason: 'not-owner' });
  });

  it('logs a failed opening turn against the briefing surface', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getActiveLink.mockResolvedValue(activeLink(false, false));
    callCoach.mockRejectedValue(new Error('down'));

    const result = await startBriefing('coach_1', 'a1', TODAY);

    expect(result).toEqual({ ok: false, reason: 'coach-unavailable' });
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({
      event: 'coach_call_failed',
      surface: 'coach_briefing',
      athleteId: 'a1',
      conversationId: null,
    });
    spy.mockRestore();
  });
});

describe('startBriefing — the races reach the Head Coach (training-architecture/09)', () => {
  const target = {
    id: 't', athleteId: 'a1', name: 'IM Copenhagen', date: '2027-08-15', distance: 'Full',
    isTarget: true, createdAt: new Date('2026-06-01T10:00:00Z'),
  };

  beforeEach(() => {
    getTargetRace.mockReset().mockResolvedValue(null);
    getRaces.mockReset().mockResolvedValue([]);
  });

  it('lists the athlete’s future races when reports are shared, and omits ones already run', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));
    getTargetRace.mockResolvedValue(target);
    getRaces.mockResolvedValue([
      target,
      { ...target, id: 'r2', name: 'Olympic Odense', date: '2027-03-01', distance: 'Olympic', isTarget: false },
      { ...target, id: 'past', name: 'Sprint Vejle', date: '2026-05-01', distance: 'Sprint', isTarget: false },
    ]);

    await startBriefing('coach_1', 'a1', TODAY);

    const system = lastSystem();
    expect(system).toContain('IM Copenhagen (Full) — target');
    expect(system).toContain('Olympic Odense (Olympic) — tune-up');
    expect(system).not.toContain('Sprint Vejle');
    expect(system).not.toContain('No Target Race');
  });

  it('tells the Head Coach the athlete has No Target Race', async () => {
    getActiveLink.mockResolvedValue(activeLink(true, false));

    await startBriefing('coach_1', 'a1', TODAY);

    expect(lastSystem()).toContain('No Target Race');
  });

  it('fetches no races at all when reports are not shared', async () => {
    getActiveLink.mockResolvedValue(activeLink(false, false));

    await startBriefing('coach_1', 'a1', TODAY);

    expect(getRaces).not.toHaveBeenCalled();
    expect(lastSystem()).not.toContain('No Target Race');
  });
});
