import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveHeadCoachId, editBlockAsHeadCoach, revalidatePath } = vi.hoisted(() => ({
  resolveHeadCoachId: vi.fn(),
  editBlockAsHeadCoach: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../../current-actor', () => ({ resolveHeadCoachId }));
vi.mock('@/features/coach/training-block-service', () => ({ editBlockAsHeadCoach }));

const { editBlockAction } = await import('./block-actions');

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
