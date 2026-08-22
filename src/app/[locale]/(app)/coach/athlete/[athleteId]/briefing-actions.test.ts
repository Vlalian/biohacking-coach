import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveHeadCoachWithLanguage, startBriefing, continueBriefing } = vi.hoisted(
  () => ({
    resolveHeadCoachWithLanguage: vi.fn(),
    startBriefing: vi.fn(),
    continueBriefing: vi.fn(),
  }),
);

vi.mock('../../../../current-actor', () => ({ resolveHeadCoachWithLanguage }));
vi.mock('@/features/coach/briefing-service', () => ({ startBriefing, continueBriefing }));

const { startBriefingAction, sendBriefingMessageAction } = await import(
  './briefing-actions'
);

/**
 * The Coach Briefing reads one athlete's data on a coach's behalf, so the whole
 * question at this boundary is *whose* authority is used. The client names which
 * athlete; it never names who is asking. The link gate and Link Visibility live
 * in the service — what is asserted here is that a client-supplied coach id can
 * never reach it.
 */
const COACH = 'coach_1';
const ATHLETE = 'athlete_1';

beforeEach(() => {
  resolveHeadCoachWithLanguage.mockReset();
  startBriefing.mockReset();
  continueBriefing.mockReset();
});

describe('startBriefingAction', () => {
  it('briefs as the resolved coach, on the server date, in their language', async () => {
    resolveHeadCoachWithLanguage.mockResolvedValue({
      ok: true,
      coachId: COACH,
      language: 'da',
    });
    startBriefing.mockResolvedValue({ ok: true });

    const result = await startBriefingAction(ATHLETE);

    expect(result).toEqual({ ok: true });
    expect(startBriefing).toHaveBeenCalledWith(
      COACH,
      ATHLETE,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      'da',
    );
  });

  it('refuses a caller who is not a Head Coach, reading nothing', async () => {
    resolveHeadCoachWithLanguage.mockResolvedValue({ ok: false, reason: 'not-a-coach' });

    const result = await startBriefingAction(ATHLETE);

    expect(result).toEqual({ ok: false, reason: 'not-a-coach' });
    expect(startBriefing).not.toHaveBeenCalled();
  });
});

describe('sendBriefingMessageAction', () => {
  it('continues the conversation as the resolved coach', async () => {
    resolveHeadCoachWithLanguage.mockResolvedValue({ ok: true, coachId: COACH });
    continueBriefing.mockResolvedValue({ ok: true });

    const result = await sendBriefingMessageAction('conv_1', 'How has her sleep trended?');

    expect(result).toEqual({ ok: true });
    expect(continueBriefing).toHaveBeenCalledWith(
      COACH,
      'conv_1',
      'How has her sleep trended?',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      undefined,
    );
  });

  it('refuses a caller who is not a Head Coach', async () => {
    resolveHeadCoachWithLanguage.mockResolvedValue({ ok: false, reason: 'not-a-coach' });

    const result = await sendBriefingMessageAction('conv_1', 'anything');

    expect(result).toEqual({ ok: false, reason: 'not-a-coach' });
    expect(continueBriefing).not.toHaveBeenCalled();
  });
});
