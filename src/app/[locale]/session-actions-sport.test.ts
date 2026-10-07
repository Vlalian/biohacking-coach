import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveAthleteId, createAthleteSession, updateAthleteSession } = vi.hoisted(() => ({
  resolveAthleteId: vi.fn(),
  createAthleteSession: vi.fn(),
  updateAthleteSession: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/session/session-status', () => ({
  completeSession: vi.fn(),
  toggleSkipSession: vi.fn(),
  toggleUnavailableSession: vi.fn(),
}));
vi.mock('@/features/session/athlete-session', () => ({
  createAthleteSession,
  updateAthleteSession,
  deleteAthleteSession: vi.fn(),
}));

const { createAthleteSessionAction, updateAthleteSessionAction } = await import('./session-actions');

/** `showable-version/52` — the sport the athlete picked reaches the service the actions call. */
const NEW_SESSION = { date: '2026-07-16', type: 'Strength', durationMin: 30, isTraining: true, note: null };
const EDIT = { type: 'Strength', durationMin: 30, isTraining: true, note: null };

beforeEach(() => {
  vi.clearAllMocks();
  resolveAthleteId.mockResolvedValue('athlete_1');
  createAthleteSession.mockResolvedValue({ ok: true });
  updateAthleteSession.mockResolvedValue({ ok: true });
});

describe('the athlete session actions and the sport', () => {
  it('hands the sport picked to the create service', async () => {
    await createAthleteSessionAction({ ...NEW_SESSION, sport: 'brick' });
    expect(createAthleteSession).toHaveBeenCalledWith(expect.objectContaining({ athleteId: 'athlete_1', sport: 'brick' }));
  });

  it('hands the sport picked to the update service, with the version it was read at', async () => {
    await updateAthleteSessionAction('s1', { ...EDIT, sport: 'mobility' }, 4);
    expect(updateAthleteSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', sport: 'mobility', expectedVersion: 4 }),
    );
  });

  it('hands none on when the athlete picked none', async () => {
    await createAthleteSessionAction({ ...NEW_SESSION, sport: null });
    expect(createAthleteSession.mock.calls[0][0]).toHaveProperty('sport', null);
    await updateAthleteSessionAction('s1', { ...EDIT, sport: null }, 1);
    expect(updateAthleteSession.mock.calls[0][0]).toHaveProperty('sport', null);
  });
});
