import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `training-architecture/06` — the Head Coach writes to the detail thread only
 * through an active Coaching Link that shares the athlete's reports. Both
 * gates are proved here, before the repository is reached: the repository's
 * own ownership check (ADR 0006) protects the athlete's id; this protects the
 * coach's standing to write at all.
 */
const { getActiveLink, addHealthNote, getHealthNotes, getHealthHistory } = vi.hoisted(() => ({
  getActiveLink: vi.fn<() => Promise<unknown>>(async () => undefined),
  addHealthNote: vi.fn(async () => {}),
  getHealthNotes: vi.fn(async () => [{ id: 'n1', body: 'physio Thursday' }]),
  getHealthHistory: vi.fn(async () => ({ injuries: [{ id: 'inj_1' }], illnesses: [] })),
}));
vi.mock('@/features/coach/coach-repository', () => ({ getActiveLink }));
vi.mock('./health-repository', () => ({ addHealthNote, getHealthNotes, getHealthHistory }));

const { addHealthNoteAsHeadCoach, readHealthAsHeadCoach } = await import('./health-service');

const link = (shareAthleteReports: boolean) => ({
  id: 'link_1',
  athleteId: 'a1',
  headCoachId: 'hc_1',
  visibility: { shareAthleteReports, shareAiTranscripts: false },
});

beforeEach(() => {
  getActiveLink.mockReset().mockResolvedValue(undefined);
  addHealthNote.mockClear();
  getHealthNotes.mockClear();
  getHealthHistory.mockClear();
});

describe('addHealthNoteAsHeadCoach', () => {
  it('writes as the head coach when the link is active and reports are shared', async () => {
    getActiveLink.mockResolvedValue(link(true));

    const result = await addHealthNoteAsHeadCoach('hc_1', 'a1', { injuryId: 'inj_1' }, '  physio Thursday ');

    expect(result).toEqual({ ok: true });
    expect(getActiveLink).toHaveBeenCalledWith('hc_1', 'a1');
    expect(addHealthNote).toHaveBeenCalledWith('a1', { injuryId: 'inj_1' }, 'head_coach', 'physio Thursday');
  });

  it('writes nothing without an active link', async () => {
    const result = await addHealthNoteAsHeadCoach('hc_1', 'a1', { injuryId: 'inj_1' }, 'x');
    expect(result).toEqual({ ok: false, reason: 'not-linked' });
    expect(addHealthNote).not.toHaveBeenCalled();
  });

  it('writes nothing when the athlete does not share their reports — the thread is theirs', async () => {
    getActiveLink.mockResolvedValue(link(false));
    const result = await addHealthNoteAsHeadCoach('hc_1', 'a1', { illnessId: 'ill_1' }, 'x');
    expect(result).toEqual({ ok: false, reason: 'not-visible' });
    expect(addHealthNote).not.toHaveBeenCalled();
  });

  it('refuses an empty note before touching the link', async () => {
    getActiveLink.mockResolvedValue(link(true));
    expect(await addHealthNoteAsHeadCoach('hc_1', 'a1', { injuryId: 'inj_1' }, '   ')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(addHealthNote).not.toHaveBeenCalled();
  });
});

describe('readHealthAsHeadCoach — the same gate on the way out', () => {
  it('returns the history and the thread when the link shares reports', async () => {
    getActiveLink.mockResolvedValue(link(true));
    const result = await readHealthAsHeadCoach('hc_1', 'a1', { injuryId: 'inj_1' });
    expect(result).toEqual({ ok: true, notes: [{ id: 'n1', body: 'physio Thursday' }] });
    expect(getHealthNotes).toHaveBeenCalledWith('a1', { injuryId: 'inj_1' });
  });

  it('fetches nothing at all when reports are not shared or there is no link', async () => {
    getActiveLink.mockResolvedValue(link(false));
    expect(await readHealthAsHeadCoach('hc_1', 'a1', { injuryId: 'inj_1' })).toEqual({
      ok: false,
      reason: 'not-visible',
    });
    getActiveLink.mockResolvedValue(undefined);
    expect(await readHealthAsHeadCoach('hc_1', 'a1', { injuryId: 'inj_1' })).toEqual({
      ok: false,
      reason: 'not-linked',
    });
    expect(getHealthNotes).not.toHaveBeenCalled();
  });
});
