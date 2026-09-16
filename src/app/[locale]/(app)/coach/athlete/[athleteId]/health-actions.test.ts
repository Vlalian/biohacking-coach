import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `training-architecture/06` — the Head Coach's one write to an athlete's
 * health: a note on the detail thread. The coach is resolved from the session,
 * the athlete id is a claim the service re-proves through the Coaching Link.
 */
const { resolveHeadCoachId, addHealthNoteAsHeadCoach, readHealthAsHeadCoach, revalidatePath } =
  vi.hoisted(() => ({
    resolveHeadCoachId: vi.fn<() => Promise<string | null>>(async () => 'hc_1'),
    addHealthNoteAsHeadCoach: vi.fn(async () => ({ ok: true })),
    readHealthAsHeadCoach: vi.fn(async () => ({ ok: true, notes: [] })),
    revalidatePath: vi.fn(),
  }));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../../current-actor', () => ({ resolveHeadCoachId }));
vi.mock('@/features/health/health-service', () => ({ addHealthNoteAsHeadCoach, readHealthAsHeadCoach }));

const { addHealthNoteAsCoachAction, readHealthNotesAsCoachAction } = await import('./health-actions');

beforeEach(() => {
  vi.clearAllMocks();
  resolveHeadCoachId.mockResolvedValue('hc_1');
});

describe('addHealthNoteAsCoachAction', () => {
  it('writes through the link-proving service and revalidates the athlete page', async () => {
    expect(await addHealthNoteAsCoachAction('a1', { injuryId: 'inj_1' }, 'saw her run today')).toEqual({ ok: true });
    expect(addHealthNoteAsHeadCoach).toHaveBeenCalledWith('hc_1', 'a1', { injuryId: 'inj_1' }, 'saw her run today');
    expect(revalidatePath).toHaveBeenCalledWith('/coach/athlete/a1', 'layout');
  });

  it('passes the service refusal through, without revalidating', async () => {
    addHealthNoteAsHeadCoach.mockResolvedValue({ ok: false, reason: 'not-visible' } as never);
    expect(await addHealthNoteAsCoachAction('a1', { injuryId: 'inj_1' }, 'x')).toEqual({ ok: false, reason: 'not-visible' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not a Head Coach before reaching the service', async () => {
    resolveHeadCoachId.mockResolvedValue(null);
    expect(await addHealthNoteAsCoachAction('a1', { injuryId: 'inj_1' }, 'x')).toEqual({ ok: false, reason: 'not-a-coach' });
    expect(addHealthNoteAsHeadCoach).not.toHaveBeenCalled();
  });
});

describe('readHealthNotesAsCoachAction', () => {
  it('reads the thread through the same gate', async () => {
    expect(await readHealthNotesAsCoachAction('a1', { illnessId: 'ill_1' })).toEqual({ ok: true, notes: [] });
    expect(readHealthAsHeadCoach).toHaveBeenCalledWith('hc_1', 'a1', { illnessId: 'ill_1' });
  });

  it('refuses a non-coach', async () => {
    resolveHeadCoachId.mockResolvedValue(null);
    expect(await readHealthNotesAsCoachAction('a1', { illnessId: 'ill_1' })).toEqual({ ok: false, reason: 'not-a-coach' });
    expect(readHealthAsHeadCoach).not.toHaveBeenCalled();
  });
});
