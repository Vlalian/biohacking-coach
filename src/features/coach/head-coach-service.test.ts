import { describe, it, expect, vi, beforeEach } from 'vitest';

// getActiveLink is the link gate; the db is mocked so authority logic is tested
// without Postgres. `limit` returns the target session row, `batch` records
// whether — and what — was written.
const { getActiveLink } = vi.hoisted(() => ({ getActiveLink: vi.fn() }));
const limit = vi.fn();
const batch = vi.fn().mockResolvedValue(undefined);
// The value args are typed so `.mock.calls[n][0]` is a record, not `never`.
const insertValues = vi.fn((values?: Record<string, unknown>) => ({ values }));
// `.returning()` reports whether the compare-and-set matched — an empty array
// is Postgres saying the athlete had already written this row.
const updateReturning = vi.fn().mockResolvedValue([{ version: 2 }]);
const updateSet = vi.fn((values?: Record<string, unknown>) => ({
  where: vi.fn(() => ({ values, returning: updateReturning })),
}));
const deleteReturning = vi.fn().mockResolvedValue([{ id: 'sess_1' }]);
const deleteWhere = vi.fn(() => ({ returning: deleteReturning }));

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

const {
  prescribeSession,
  editPrescribedSession,
  deletePrescribedSession,
  moveSessionAsHeadCoach,
} = await import('./head-coach-service');

/** The refusal reason, or 'ok' when the action unexpectedly succeeded. */
function reasonOf(result: { ok: boolean } & { reason?: string }): string {
  return result.ok ? 'ok' : (result.reason ?? 'ok');
}

const COACH = 'coach_1';
const ATHLETE = 'athlete_1';
const LINK = { shareAthleteReports: true, shareAiTranscripts: false };
const VALID = { date: '2026-07-16', type: 'Endurance', duration: 60, zone: 'Zone 2' };

// TODAY sits in the same Mon–Sun week as the row's default date, so an
// unqualified row is live rather than frozen and the existing content-tier tests
// keep testing what they were written to test.
const TODAY = '2026-07-16';

const sessionRow = (over: Record<string, unknown> = {}) => ({
  athleteId: ATHLETE,
  origin: 'coach',
  date: '2026-07-16',
  status: 'planned',
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

    const result = await prescribeSession({ headCoachId: COACH, athleteId: ATHLETE, input: VALID, today: TODAY });

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

  /**
   * Creating into a frozen week (`showable-version/22`, decided by Mads
   * 2026-09-08).
   *
   * The create path had no clock at all, so a Head Coach could prescribe onto
   * last Tuesday and it landed as a *planned* session in a week that was over.
   * `isFrozen` counts anything in a past week, and since `794a3c7` edit and
   * delete enforce that — so such a row was permanent the moment it existed:
   * its own author could not edit it, delete it or move it. The athlete's path
   * cannot reach that state, because `createdStatusFor` records a past-dated
   * session as completed; they are logging reality, and a coach is not.
   */
  /**
   * The edit door into the same trap (CodeRabbit on PR #57, 2026-09-09).
   *
   * `loadEditableSession` judges the frozen rule against the *stored* row, and
   * the write then sets a new date from the input. So the create guard below
   * could be walked around: edit a live current-week session, set its date to a
   * past week, and the row is frozen from that moment — its author can no
   * longer edit, delete or move it. Same end state the create guard exists to
   * prevent, reached through a different verb.
   */
  it('refuses to edit a session onto a past week, not just to edit a frozen one', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'head_coach', date: '2026-07-16' })]);

    const result = await editPrescribedSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 'sess_1',
      // The stored row is in the current week and editable; the *target* is not.
      input: { ...VALID, date: '2026-07-10' },
      expectedVersion: 1,
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'frozen' });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('refuses to prescribe into a past week, with the same reason edit and delete give', async () => {
    getActiveLink.mockResolvedValue(LINK);

    // TODAY is Thursday 2026-07-16, so its week starts Mon 2026-07-13.
    // 2026-07-10 is the Friday before — a week that is over.
    const result = await prescribeSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      input: { ...VALID, date: '2026-07-10' },
      today: TODAY,
    });

    expect(result).toEqual({ ok: false, reason: 'frozen' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('allows an earlier day inside the current week — the week is the unit, not the day', async () => {
    getActiveLink.mockResolvedValue(LINK);

    // Monday of TODAY's own week. Past as a day, not past as a week, and
    // `isFrozen` judges by week — so this must still be prescribable.
    const result = await prescribeSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      input: { ...VALID, date: '2026-07-13' },
      today: TODAY,
    });

    expect(result.ok).toBe(true);
  });

  it('refuses when the Head Coach has no active link to the athlete — nothing written', async () => {
    getActiveLink.mockResolvedValue(undefined);

    const result = await prescribeSession({ headCoachId: COACH, athleteId: 'a_stranger', input: VALID, today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'not-linked' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses an invalid prescription (bad date, empty type) without writing', async () => {
    getActiveLink.mockResolvedValue(LINK);

    expect(
      (await prescribeSession({ headCoachId: COACH, athleteId: ATHLETE, input: { date: '2026-13-40', type: 'X' }, today: TODAY })).ok,
    ).toBe(false);
    expect(
      (await prescribeSession({ headCoachId: COACH, athleteId: ATHLETE, input: { date: '2026-07-16', type: '  ' }, today: TODAY })).ok,
    ).toBe(false);
    expect(batch).not.toHaveBeenCalled();
  });
});

describe('editPrescribedSession — the content tier holds', () => {
  it('reports the version it wrote, so the calendar keeps the session current without a reload (showable-version/44)', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'head_coach', version: 4 })]);
    updateReturning.mockResolvedValueOnce([{ version: 5 }]);

    const result = await editPrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', input: VALID, expectedVersion: 4, today: TODAY });

    expect(result).toEqual({ ok: true, sessionId: 's1', version: 5 });
  });

  it('edits a Coach-authored session and records a head_coach event', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'coach' })]);

    const result = await editPrescribedSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 's1',
      input: { ...VALID, title: 'Revised threshold set' },
      expectedVersion: 1,
      today: TODAY,
    });

    expect(result).toEqual({ ok: true, sessionId: 's1', version: 2 });
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
      (await editPrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', input: VALID, expectedVersion: 1, today: TODAY })).ok,
    ).toBe(true);
  });

  it('refuses to edit an Athlete Session — view-only even to the Head Coach', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'athlete' })]);

    const result = await editPrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', input: VALID, expectedVersion: 1, today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'forbidden-origin' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses to edit a Garmin import — the record is immutable', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'garmin' })]);

    expect(
      reasonOf(await editPrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', input: VALID, expectedVersion: 1, today: TODAY })),
    ).toBe('forbidden-origin');
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses with no active link before reading the session', async () => {
    getActiveLink.mockResolvedValue(undefined);

    const result = await editPrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', input: VALID, expectedVersion: 1, today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'not-linked' });
    expect(limit).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses an edit the athlete already overwrote, and logs nothing', async () => {
    // The interleaving FR-5 exists for: the coach opened the editor at version
    // 1, the athlete moved the session in the meantime, and the coach's save
    // arrives second. It must lose visibly rather than silently win.
    getActiveLink.mockResolvedValue(LINK);
    limit
      .mockResolvedValueOnce([sessionRow({ origin: 'head_coach' })])
      .mockResolvedValueOnce([
        { ...sessionRow({ origin: 'head_coach' }), date: '2026-07-20', version: 2 },
      ]);
    updateReturning.mockResolvedValueOnce([]);

    const result = await editPrescribedSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 's1',
      input: VALID,
      expectedVersion: 1,
      today: TODAY,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a conflict');
    expect(result.reason).toBe('conflict');
    if (result.reason !== 'conflict') throw new Error('expected a conflict');
    expect(result.conflict.divergences).toContainEqual({
      field: 'date',
      current: '2026-07-20',
      attempted: VALID.date,
    });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('refuses to reach across to a session that is not the linked athlete’s', async () => {
    // A valid link to ATHLETE paired with a session belonging to someone else.
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ athleteId: 'another_athlete' })]);

    const result = await editPrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', input: VALID, expectedVersion: 1, today: TODAY });

    expect(result).toEqual({ ok: false, reason: 'wrong-athlete' });
    expect(batch).not.toHaveBeenCalled();
  });
});

describe('deletePrescribedSession — same content tier', () => {
  it('deletes a plan session and records a head_coach event', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'head_coach' })]);

    const result = await deletePrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', expectedVersion: 1, today: TODAY });

    expect(result).toEqual({ ok: true, sessionId: 's1' });
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'head_coach', actorId: COACH, type: 'session_deleted' }),
    );
  });

  it('refuses to delete an Athlete Session', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'athlete' })]);

    expect(
      reasonOf(await deletePrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 's1', expectedVersion: 1, today: TODAY })),
    ).toBe('forbidden-origin');
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses without an active link', async () => {
    getActiveLink.mockResolvedValue(undefined);

    expect(
      reasonOf(await deletePrescribedSession({ headCoachId: COACH, athleteId: 'a_stranger', sessionId: 's1', expectedVersion: 1, today: TODAY })),
    ).toBe('not-linked');
    expect(batch).not.toHaveBeenCalled();
  });

  it('returns not-found when the session does not exist', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([]);

    expect(
      reasonOf(await deletePrescribedSession({ headCoachId: COACH, athleteId: ATHLETE, sessionId: 'missing', expectedVersion: 1, today: TODAY })),
    ).toBe('not-found');
    expect(batch).not.toHaveBeenCalled();
  });
});

describe('moveSessionAsHeadCoach — the Head Coach re-places a session', () => {
  // Placement became shared on 2026-08-21 (ADR 0003 amendment). The Move rules
  // are not re-implemented here — they are proven in session-move.test.ts. What
  // this covers is the gate around them.
  const TODAY = '2026-07-15';

  it('moves a coach-authored session and records a head_coach event', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ status: 'planned' })]);

    const result = await moveSessionAsHeadCoach({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: TODAY,
      expectedVersion: 1,
    });

    expect(result).toEqual({ ok: true, version: 2 });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'head_coach', actorId: COACH }),
    );
  });

  it('refuses a coach with no active link, and reads nothing', async () => {
    getActiveLink.mockResolvedValue(undefined);

    const result = await moveSessionAsHeadCoach({
      headCoachId: COACH,
      athleteId: 'not-my-athlete',
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: TODAY,
      expectedVersion: 1,
    });

    expect(reasonOf(result)).toBe('not-linked');
    expect(limit).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('refuses an Athlete Session, which is still the athlete territory', async () => {
    // The placement rule was reversed; "may only view Athlete Sessions" was not.
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'athlete', status: 'planned' })]);

    const result = await moveSessionAsHeadCoach({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 'sess_1',
      targetDate: '2026-07-18',
      today: TODAY,
      expectedVersion: 1,
    });

    expect(result.ok).toBe(false);
    expect(batch).not.toHaveBeenCalled();
  });

  it('rejects a malformed target date before touching the link or the row', async () => {
    const result = await moveSessionAsHeadCoach({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 'sess_1',
      targetDate: 'tomorrow-ish',
      today: TODAY,
      expectedVersion: 1,
    });

    expect(reasonOf(result)).toBe('bounce');
    expect(getActiveLink).not.toHaveBeenCalled();
  });
});

describe('the record is immutable for the Head Coach too', () => {
  /**
   * `loadEditableSession` refused three things — not-found, wrong-athlete and
   * forbidden-origin — and never looked at status or date. So a *completed*
   * coach-authored session passed the gate and could be rewritten or removed.
   *
   * Nothing was exposed until 2026-09-04, because `roster-service.planSessions`
   * filters completed sessions off the Head Coach's only editing surface. That
   * made the record's immutability a property of a list filter, and
   * showable-version/20 opened a drawer on every session — so the protection
   * became purely client-side, which is the arrangement ADR 0006 forbids.
   */
  it('refuses to edit a completed session', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'coach', status: 'completed' })]);

    const result = await editPrescribedSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 's1',
      input: VALID,
      expectedVersion: 1,
      today: TODAY,
    });

    expect(reasonOf(result)).toBe('frozen');
    expect(updateSet).not.toHaveBeenCalled();
  });

  it('refuses to delete a completed session', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'coach', status: 'completed' })]);

    const result = await deletePrescribedSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 's1',
      expectedVersion: 1,
      today: TODAY,
    });

    expect(reasonOf(result)).toBe('frozen');
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it('refuses to edit anything in a past week, whatever its status', async () => {
    // Frozen for a different reason than completed: Week Rebalancing has already
    // absorbed the missed load (ADR 0002), so last week is closed even for a
    // session that never happened.
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ date: '2026-07-08', status: 'planned' })]);

    const result = await editPrescribedSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 's1',
      input: VALID,
      expectedVersion: 1,
      today: TODAY,
    });

    expect(reasonOf(result)).toBe('frozen');
  });

  it('refuses to delete anything in a past week', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ date: '2026-07-08', status: 'planned' })]);

    expect(
      reasonOf(
        await deletePrescribedSession({
          headCoachId: COACH,
          athleteId: ATHLETE,
          sessionId: 's1',
          expectedVersion: 1,
          today: TODAY,
        }),
      ),
    ).toBe('frozen');
  });

  it('still edits an ordinary planned session in the current week', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow()]);

    expect(
      (
        await editPrescribedSession({
          headCoachId: COACH,
          athleteId: ATHLETE,
          sessionId: 's1',
          input: VALID,
          expectedVersion: 1,
          today: TODAY,
        })
      ).ok,
    ).toBe(true);
  });

  it('still edits a future-dated session', async () => {
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ date: '2026-07-18' })]);

    expect(
      (
        await editPrescribedSession({
          headCoachId: COACH,
          athleteId: ATHLETE,
          sessionId: 's1',
          input: VALID,
          expectedVersion: 1,
          today: TODAY,
        })
      ).ok,
    ).toBe(true);
  });

  it('says "not yours" before it says "too late"', async () => {
    // An Athlete Session that is also completed fails both gates. Origin is the
    // more fundamental answer and is the one the coach should read — the same
    // ordering `drawer-policy.ts` gives them on screen.
    getActiveLink.mockResolvedValue(LINK);
    limit.mockResolvedValue([sessionRow({ origin: 'athlete', status: 'completed' })]);

    const result = await editPrescribedSession({
      headCoachId: COACH,
      athleteId: ATHLETE,
      sessionId: 's1',
      input: VALID,
      expectedVersion: 1,
      today: TODAY,
    });

    expect(reasonOf(result)).toBe('forbidden-origin');
  });

  it('refuses exactly what isFrozen calls frozen, and nothing else', async () => {
    // The rule lives in move-rules.ts and Session Move asks the same function,
    // so "a completed session is frozen" cannot mean one thing for placement and
    // another for content. A second copy here is how those two drift.
    const { isFrozen } = await import('@/features/session/move-rules');

    for (const date of ['2026-07-08', TODAY, '2026-07-18']) {
      for (const status of ['planned', 'completed', 'skipped', 'unavailable']) {
        getActiveLink.mockResolvedValue(LINK);
        limit.mockResolvedValue([sessionRow({ date, status })]);

        const result = await editPrescribedSession({
          headCoachId: COACH,
          athleteId: ATHLETE,
          sessionId: 's1',
          input: VALID,
          expectedVersion: 1,
          today: TODAY,
        });

        expect(reasonOf(result) === 'frozen', `${date}/${status}`).toBe(
          isFrozen({ date, status }, TODAY),
        );
      }
    }
  });
});
