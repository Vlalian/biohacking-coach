import { describe, it, expect, vi, beforeEach } from 'vitest';

// getActiveLink is the link gate; the db is mocked so authority logic is tested
// without Postgres. `limit` returns the target session row, `batch` records
// whether — and what — was written.
const { getActiveLink } = vi.hoisted(() => ({ getActiveLink: vi.fn() }));
const limit = vi.fn();
const batch = vi.fn().mockResolvedValue(undefined);
// The value args are typed so `.mock.calls[n][0]` is a record, not `never`.
const insertValues = vi.fn((values?: Record<string, unknown>) => ({ values }));
const updateSet = vi.fn((values?: Record<string, unknown>) => ({
  where: vi.fn(() => ({ values })),
}));
const deleteWhere = vi.fn(() => ({}));

vi.mock('@/db', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
    insert: () => ({ values: insertValues }),
    update: () => ({ set: updateSet }),
    delete: () => ({ where: deleteWhere }),
    batch,
  }),
}));
vi.mock('./coach-repository', () => ({ getActiveLink }));

const { prescribeSession, editPrescribedSession, deletePrescribedSession } =
  await import('./head-coach-service');

/** The refusal reason, or 'ok' when the action unexpectedly succeeded. */
function reasonOf(result: { ok: boolean } & { reason?: string }): string {
  return result.ok ? 'ok' : (result.reason ?? 'ok');
}

const COACH = 'coach_1';
const ATHLETE = 'athlete_1';
const LINK = { shareAthleteReports: true, shareAiTranscripts: false };
const VALID = { date: '2026-07-16', type: 'Endurance', duration: 60, zone: 'Zone 2' };

const sessionRow = (over: Record<string, unknown> = {}) => ({
  athleteId: ATHLETE,
  origin: 'coach',
  date: '2026-07-16',
  ...over,
});

beforeEach(() => {
  getActiveLink.mockReset();
  limit.mockReset();
  batch.mockClear();
  insertValues.mockClear();
  updateSet.mockClear();
  deleteWhere.mockClear();
});

describe('prescribeSession — the Head Coach adds a Prescribed Session', () => {
  it('persists origin head_coach and records a head_coach event in one batch', async () => {
    getActiveLink.mockResolvedValue(LINK);

    const result = await prescribeSession({ headCoachId: COACH, athleteId: ATHLETE, input: VALID });

    expect(result.ok).toBe(true);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2); // session + event, atomic
    // The session carries origin head_coach.
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: ATHLETE, origin: 'head_coach', type: 'Endurance' }),
    );
    // The event is attributed to the head coach, narrated_at left null (default).
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: ATHLETE,
        actorType: 'head_coach',
        actorId: COACH,
        type: 'session_prescribed',
      }),
    );
    // Nothing about narration — the announcement half stays benched.
    const eventCall = insertValues.mock.calls
      .map((c) => c[0])
      .find((v) => v?.type === 'session_prescribed')!;
    expect(eventCall).not.toHaveProperty('narratedAt');
  });

  it('refuses when the Head Coach has no active link to the athlete — nothing written', async () => {
    getActiveLink.mockResolvedValue(undefined);

    const result = await prescribeSession({ headCoachId: COACH, athleteId: 'a_stranger', input: VALID });

    expect(result).toEqual({ ok: false, reason: 'not-linked' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses an invalid prescription (bad date, empty type) without writing', async () => {
    getActiveLink.mockResolvedValue(LINK);

    expect(
      (await prescribeSession({ headCoachId: COACH, athleteId: ATHLETE, input: { date: '2026-13-40', type: 'X' } })).ok,
    ).toBe(false);
    expect(
      (await prescribeSession({ headCoachId: COACH, athleteId: ATHLETE, input: { date: '2026-07-16', type: '  ' } })).ok,
    ).toBe(false);
    expect(batch).not.toHaveBeenCalled();
  });
});

describe('editPrescribedSession — the content tier holds', () => {
  it('edits a Coach-authored session and records a head_coach event', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'coach' })]);

    const result = await editPrescribedSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 's1',
      input: { ...VALID, title: 'Revised threshold set' },
    });

    expect(result).toEqual({ ok: true, sessionId: 's1' });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Revised threshold set' }),
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'head_coach', actorId: COACH, type: 'session_edited' }),
    );
  });

  it('edits the Head Coach’s own prescription', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'head_coach' })]);

    expect(
      (await editPrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', input: VALID })).ok,
    ).toBe(true);
  });

  it('refuses to edit an Athlete Session — view-only even to the Head Coach', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'athlete' })]);

    const result = await editPrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', input: VALID });

    expect(result).toEqual({ ok: false, reason: 'forbidden-origin' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses to edit a Garmin import — the record is immutable', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'garmin' })]);

    expect(
      reasonOf(await editPrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', input: VALID })),
    ).toBe('forbidden-origin');
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses with no active link before reading the session', async () => {
    getActiveLink.mockResolvedValue(undefined);

    const result = await editPrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', input: VALID });

    expect(result).toEqual({ ok: false, reason: 'not-linked' });
    expect(limit).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses to reach across to a session that is not the linked athlete’s', async () => {
    // A valid link to ATHLETE paired with a session belonging to someone else.
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ athleteId: 'another_athlete' })]);

    const result = await editPrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', input: VALID });

    expect(result).toEqual({ ok: false, reason: 'wrong-athlete' });
    expect(batch).not.toHaveBeenCalled();
  });
});

describe('deletePrescribedSession — same content tier', () => {
  it('deletes a plan session and records a head_coach event in one batch', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'head_coach' })]);

    const result = await deletePrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1' });

    expect(result).toEqual({ ok: true, sessionId: 's1' });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(2);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'head_coach', actorId: COACH, type: 'session_deleted' }),
    );
  });

  it('refuses to delete an Athlete Session', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'athlete' })]);

    expect(
      reasonOf(await deletePrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1' })),
    ).toBe('forbidden-origin');
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses without an active link', async () => {
    getActiveLink.mockResolvedValue(undefined);

    expect(
      reasonOf(await deletePrescribedSession({ headCoachId: COACH, athleteId: 'a_stranger', sessionId: 's1' })),
    ).toBe('not-linked');
    expect(batch).not.toHaveBeenCalled();
  });

  it('returns not-found when the session does not exist', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([]);

    expect(
      reasonOf(await deletePrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 'missing' })),
    ).toBe('not-found');
    expect(batch).not.toHaveBeenCalled();
  });
});
