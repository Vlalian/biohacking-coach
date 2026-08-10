import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getActiveLink,
  getSharedTranscripts,
  getAthleteById,
  getBriefingPlan,
  getBriefingReflections,
  callCoach,
  createBriefing,
  getOwnedBriefing,
  getLatestBriefingWithMessages,
  appendBriefingMessages,
  getMessages,
} = vi.hoisted(() => ({
  getActiveLink: vi.fn(),
  getSharedTranscripts: vi.fn((): Promise<unknown[] | null> => Promise.resolve(null)),
  getAthleteById: vi.fn(),
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
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteById }));
vi.mock('@/features/session/session-repository', () => ({
  getBriefingPlan,
  getBriefingReflections,
}));
vi.mock('./coach-client', () => ({ callCoach }));
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
      trainingPhase: 'Build',
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

    await expect(startBriefing('coach_1', 'a1', TODAY)).rejects.toThrow('anthropic down');
    expect(createBriefing).not.toHaveBeenCalled();
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
    // The coach's turn is stored as head_coach, then the AI reply as coach_ai.
    expect(appendBriefingMessages).toHaveBeenNthCalledWith(1, 'coach_1', 'b1', [
      { role: 'head_coach', content: 'how is her sleep?' },
    ]);
    expect(appendBriefingMessages).toHaveBeenNthCalledWith(2, 'coach_1', 'b1', [
      { role: 'coach_ai', content: 'my read' },
    ]);
  });
});
