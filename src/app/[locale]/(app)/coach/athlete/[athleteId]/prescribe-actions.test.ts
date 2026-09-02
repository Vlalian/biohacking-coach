import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  resolveHeadCoachId,
  prescribeSession,
  editPrescribedSession,
  deletePrescribedSession,
  moveSessionAsHeadCoach,
  revalidatePath,
} = vi.hoisted(() => ({
  resolveHeadCoachId: vi.fn(),
  prescribeSession: vi.fn(),
  editPrescribedSession: vi.fn(),
  deletePrescribedSession: vi.fn(),
  moveSessionAsHeadCoach: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../../current-actor', () => ({ resolveHeadCoachId }));
vi.mock('@/features/coach/head-coach-service', () => ({
  prescribeSession,
  editPrescribedSession,
  deletePrescribedSession,
  moveSessionAsHeadCoach,
}));

const {
  prescribeSessionAction,
  editPrescribedSessionAction,
  deletePrescribedSessionAction,
  moveSessionAsCoachAction,
} = await import('./prescribe-actions');

/**
 * Four actions by which a Head Coach changes someone else's plan — the sharpest
 * boundary in the app, because the athlete whose data is written is named by the
 * request while the authority to write it is not.
 *
 * The Coaching Link gate and the content-authority guards live in the service
 * and are tested there. Asserted here: the acting coach comes from the session,
 * `today` is the server's, and revalidation is scoped to the layout so a change
 * made on the Plan tab is not stale on Data or Briefing.
 */
const COACH = 'coach_1';
const ATHLETE = 'athlete_1';
const INPUT = { date: '2026-07-16', type: 'Endurance', duration: 60, zone: 'Zone 2' };

beforeEach(() => {
  resolveHeadCoachId.mockReset();
  prescribeSession.mockReset();
  editPrescribedSession.mockReset();
  deletePrescribedSession.mockReset();
  moveSessionAsHeadCoach.mockReset();
  revalidatePath.mockClear();
});

describe('the plan-authoring actions', () => {
  const cases = [
    [
      'prescribeSessionAction',
      () => prescribeSessionAction(ATHLETE, INPUT),
      prescribeSession,
      { headCoachId: COACH, athleteId: ATHLETE, input: INPUT },
    ],
    [
      'editPrescribedSessionAction',
      () => editPrescribedSessionAction(ATHLETE, 'sess_1', INPUT, 1),
      editPrescribedSession,
      { headCoachId: COACH, athleteId: ATHLETE, sessionId: 'sess_1', input: INPUT, expectedVersion: 1 },
    ],
    [
      'deletePrescribedSessionAction',
      () => deletePrescribedSessionAction(ATHLETE, 'sess_1', 1),
      deletePrescribedSession,
      { headCoachId: COACH, athleteId: ATHLETE, sessionId: 'sess_1', expectedVersion: 1 },
    ],
  ] as const;

  it.each(cases)('%s acts as the resolved coach', async (_name, call, service, args) => {
    resolveHeadCoachId.mockResolvedValue(COACH);
    service.mockResolvedValue({ ok: true, sessionId: 'sess_1' });

    await expect(call()).resolves.toEqual({ ok: true, sessionId: 'sess_1' });
    expect(service).toHaveBeenCalledWith(args);
  });

  it.each(cases)('%s refuses a caller with no coach row', async (_name, call, service) => {
    resolveHeadCoachId.mockResolvedValue(null);

    await expect(call()).resolves.toEqual({ ok: false, reason: 'not-a-coach' });
    expect(service).not.toHaveBeenCalled();
  });

  it.each(cases)('%s revalidates the layout, not just the page', async (
    _name,
    call,
    service,
  ) => {
    resolveHeadCoachId.mockResolvedValue(COACH);
    service.mockResolvedValue({ ok: true, sessionId: 'sess_1' });

    await call();

    // The athlete surface is three nested tab routes; page-scoped revalidation
    // would leave the other two serving what they read before.
    expect(revalidatePath).toHaveBeenCalledWith(`/coach/athlete/${ATHLETE}`, 'layout');
  });

  it.each(cases)('%s revalidates nothing when refused', async (_name, call, service) => {
    resolveHeadCoachId.mockResolvedValue(COACH);
    service.mockResolvedValue({ ok: false, reason: 'not-linked' });

    await call();

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('moveSessionAsCoachAction', () => {
  // Placement became shared on 2026-08-21 (ADR 0003 amendment). The Move rules
  // and the link gate are proven in the service and in session-move.test.ts.
  it('moves as the resolved coach, against the server clock', async () => {
    resolveHeadCoachId.mockResolvedValue(COACH);
    moveSessionAsHeadCoach.mockResolvedValue({ ok: true });

    const result = await moveSessionAsCoachAction(ATHLETE, 'sess_1', '2026-07-18', 1);

    expect(result).toEqual({ ok: true });
    expect(moveSessionAsHeadCoach).toHaveBeenCalledWith({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      // A coach move is a contested write like any other (FR-5).
      expectedVersion: 1,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/coach/athlete/${ATHLETE}`, 'layout');
  });

  it('refuses a caller with no coach row, without touching the plan', async () => {
    resolveHeadCoachId.mockResolvedValue(null);

    const result = await moveSessionAsCoachAction(ATHLETE, 'sess_1', '2026-07-18', 1);

    expect(result).toEqual({ ok: false, reason: 'not-a-coach' });
    expect(moveSessionAsHeadCoach).not.toHaveBeenCalled();
  });

  it('revalidates nothing when the move is refused', async () => {
    resolveHeadCoachId.mockResolvedValue(COACH);
    moveSessionAsHeadCoach.mockResolvedValue({ ok: false, reason: 'frozen' });

    await moveSessionAsCoachAction(ATHLETE, 'sess_1', '2026-07-18', 1);

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
