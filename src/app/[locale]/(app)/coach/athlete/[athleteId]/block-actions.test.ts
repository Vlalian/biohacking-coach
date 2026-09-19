import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  resolveHeadCoachId,
  editBlockAsHeadCoach,
  repinBlockSetAsHeadCoach,
  restartBlockSetFromDraftAsHeadCoach,
  revalidatePath,
} = vi.hoisted(() => ({
  resolveHeadCoachId: vi.fn(),
  editBlockAsHeadCoach: vi.fn(),
  repinBlockSetAsHeadCoach: vi.fn(),
  restartBlockSetFromDraftAsHeadCoach: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../../current-actor', () => ({ resolveHeadCoachId }));
vi.mock('@/features/coach/training-block-service', () => ({
  editBlockAsHeadCoach,
  repinBlockSetAsHeadCoach,
  restartBlockSetFromDraftAsHeadCoach,
}));

const { editBlockAction, repinBlockSetAction, restartBlockSetAction } = await import('./block-actions');

/**
 * `training-architecture/08` — the one action behind a Head Coach's block edit.
 * Like `prescribe-actions.test.ts`: the athlete whose plan is written is named
 * by the request, the authority to write it is not, and this is the seam where
 * that is decided.
 */
describe('editBlockAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editBlockAsHeadCoach.mockResolvedValue({ ok: true, version: 2 });
  });

  it('refuses a caller who is not a coach without touching the service', async () => {
    resolveHeadCoachId.mockResolvedValue(null);

    expect(await editBlockAction('a1', 'r1', 1, { name: 'Long Rides' }, 1)).toEqual({
      ok: false,
      reason: 'not-a-coach',
    });
    expect(editBlockAsHeadCoach).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('resolves the acting coach from the session and passes the server clock', async () => {
    resolveHeadCoachId.mockResolvedValue('coach_1');

    const result = await editBlockAction('a1', 'r1', 2, { endDate: '2027-04-25' }, 5);

    expect(result).toEqual({ ok: true, version: 2 });
    expect(editBlockAsHeadCoach).toHaveBeenCalledWith({
      headCoachId: 'coach_1',
      athleteId: 'a1',
      raceId: 'r1',
      position: 2,
      input: { endDate: '2027-04-25' },
      expectedVersion: 5,
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(revalidatePath).toHaveBeenCalledWith('/coach/athlete/a1', 'layout');
  });

  it('passes a refusal through and revalidates nothing', async () => {
    resolveHeadCoachId.mockResolvedValue('coach_1');
    editBlockAsHeadCoach.mockResolvedValue({ ok: false, reason: 'conflict', current: { version: 3, startDate: 'x', blocks: [] } });

    const result = await editBlockAction('a1', 'r1', 1, { name: 'X' }, 2);

    expect(result).toMatchObject({ ok: false, reason: 'conflict' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

/**
 * `training-architecture/19` — the two repairs behind the login popup. Same
 * seam, same rule: the request names the athlete and the version the popup
 * showed, the session names the coach.
 */
describe('repinBlockSetAction and restartBlockSetAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repinBlockSetAsHeadCoach.mockResolvedValue({ ok: true, version: 2 });
    restartBlockSetFromDraftAsHeadCoach.mockResolvedValue({ ok: true, version: 2 });
  });

  it('both refuse a caller who is not a coach without touching the service', async () => {
    resolveHeadCoachId.mockResolvedValue(null);

    expect(await repinBlockSetAction('a1', 'r1', 3)).toEqual({ ok: false, reason: 'not-a-coach' });
    expect(await restartBlockSetAction('a1', 'r1', 3)).toEqual({ ok: false, reason: 'not-a-coach' });
    expect(repinBlockSetAsHeadCoach).not.toHaveBeenCalled();
    expect(restartBlockSetFromDraftAsHeadCoach).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('re-pin resolves the acting coach from the session, passes the server clock, and revalidates the coach pages', async () => {
    resolveHeadCoachId.mockResolvedValue('coach_1');

    expect(await repinBlockSetAction('a1', 'r1', 5)).toEqual({ ok: true, version: 2 });
    expect(repinBlockSetAsHeadCoach).toHaveBeenCalledWith({
      headCoachId: 'coach_1',
      athleteId: 'a1',
      raceId: 'r1',
      expectedVersion: 5,
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(revalidatePath).toHaveBeenCalledWith('/coach/athlete/a1', 'layout');
  });

  it('start-over does the same through the draft service', async () => {
    resolveHeadCoachId.mockResolvedValue('coach_1');

    expect(await restartBlockSetAction('a1', 'r1', 5)).toEqual({ ok: true, version: 2 });
    expect(restartBlockSetFromDraftAsHeadCoach).toHaveBeenCalledWith({
      headCoachId: 'coach_1',
      athleteId: 'a1',
      raceId: 'r1',
      expectedVersion: 5,
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(revalidatePath).toHaveBeenCalledWith('/coach/athlete/a1', 'layout');
  });

  it('a refusal passes through and revalidates nothing', async () => {
    resolveHeadCoachId.mockResolvedValue('coach_1');
    repinBlockSetAsHeadCoach.mockResolvedValue({ ok: false, reason: 'too-few-blocks', dropped: ['Taper'] });

    expect(await repinBlockSetAction('a1', 'r1', 1)).toEqual({ ok: false, reason: 'too-few-blocks', dropped: ['Taper'] });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
