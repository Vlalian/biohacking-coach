import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BlockSetRecord } from './training-block-repository';
import { trainingBlocks, type TrainingBlockSpec } from './training-blocks';

const getTargetRace = vi.fn();
const getBlockSet = vi.fn();
const insertBlockSet = vi.fn();
const casUpdateBlockSet = vi.fn();
const getAthleteById = vi.fn();
const capacityFor = vi.fn();
const getCheckInForWeek = vi.fn();
const getSessionsForAthlete = vi.fn();
const callCoach = vi.fn();
const logCoachFailure = vi.fn();
const logBlockAdjustmentRefused = vi.fn();
const getActiveLink = vi.fn();

vi.mock('@/features/race/race-repository', () => ({ getTargetRace }));
vi.mock('./training-block-repository', () => ({
  getBlockSet,
  insertBlockSet,
  casUpdateBlockSet,
}));
vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteById }));
vi.mock('@/features/health/health-repository', () => ({ capacityFor }));
vi.mock('./check-in-repository', () => ({ getCheckInForWeek }));
vi.mock('@/features/session/session-repository', () => ({ getSessionsForAthlete }));
const isCoachDisabled = vi.fn(() => false);
vi.mock('./coach-client', () => ({ callCoach, isCoachDisabled }));
vi.mock('@/lib/coach-log', () => ({ logCoachFailure, logBlockAdjustmentRefused }));
vi.mock('./coach-repository', () => ({ getActiveLink }));

const { ensureBlocksAdjusted, getResolvedBlocks, editBlockAsHeadCoach } = await import(
  './training-block-service'
);

const TODAY = '2026-09-14';
const ATHLETE = 'athlete-1';
const RACE = {
  id: 'race-1',
  athleteId: ATHLETE,
  name: 'Ironman Copenhagen',
  date: '2027-08-15',
  distance: 'Ironman',
  isTarget: true,
  createdAt: new Date(),
};

const SHAPED: TrainingBlockSpec[] = [
  { name: 'Build the Volume', endDate: '2027-01-10', authoredBy: 'coach_ai' },
  { name: 'Sharpen the Bike', endDate: '2027-05-02', authoredBy: 'coach_ai' },
  { name: 'Race Specific', endDate: '2027-07-25', authoredBy: 'coach_ai' },
  { name: 'Taper', endDate: '2027-08-15', authoredBy: 'coach_ai' },
];

function storedSet(over: Partial<BlockSetRecord> = {}): BlockSetRecord {
  return {
    id: 'set-1',
    athleteId: ATHLETE,
    raceId: RACE.id,
    startDate: '2026-09-01',
    blocks: SHAPED,
    version: 1,
    ...over,
  };
}

function toolReply(input: unknown) {
  return { text: '', toolCalls: [{ name: 'adjust_training_blocks', input }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  getTargetRace.mockResolvedValue(RACE);
  getBlockSet.mockResolvedValue(null);
  insertBlockSet.mockResolvedValue('inserted');
  casUpdateBlockSet.mockResolvedValue({ ok: true, version: 2 });
  getAthleteById.mockResolvedValue({ id: ATHLETE, experienceLevel: 'intermediate' });
  capacityFor.mockResolvedValue(null);
  getCheckInForWeek.mockResolvedValue(null);
  getSessionsForAthlete.mockResolvedValue([]);
  callCoach.mockResolvedValue(
    toolReply({ blocks: SHAPED.map(({ name, endDate }) => ({ name, endDate })) }),
  );
});

describe('ensureBlocksAdjusted — the cheap gate, no Coach call', () => {
  it('returns coach-disabled without asking or logging when the switch is set (frontend-quality/07)', async () => {
    isCoachDisabled.mockReturnValueOnce(true);
    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('coach-disabled');
    expect(callCoach).not.toHaveBeenCalled();
    expect(insertBlockSet).not.toHaveBeenCalled();
    expect(logCoachFailure).not.toHaveBeenCalled();
  });

  it('does nothing for an athlete with no Target Race', async () => {
    getTargetRace.mockResolvedValue(null);

    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('no-race');

    expect(callCoach).not.toHaveBeenCalled();
    expect(getBlockSet).not.toHaveBeenCalled();
  });

  it('does nothing when the race is under eight weeks out', async () => {
    getTargetRace.mockResolvedValue({ ...RACE, date: '2026-11-01' });

    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('too-close');

    expect(callCoach).not.toHaveBeenCalled();
  });

  it('does nothing when a set already ends on race day', async () => {
    getBlockSet.mockResolvedValue(storedSet());

    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('already-adjusted');

    expect(callCoach).not.toHaveBeenCalled();
    expect(insertBlockSet).not.toHaveBeenCalled();
    expect(casUpdateBlockSet).not.toHaveBeenCalled();
  });

  it('never redraws over a Head Coach, even when the set no longer fits the race', async () => {
    // The race moved, so the set is stale — and it still holds a human's block.
    // The Coach may suggest (the Briefing line), never overwrite.
    getBlockSet.mockResolvedValue(
      storedSet({
        blocks: [
          { name: 'Long Rides', endDate: '2027-03-01', authoredBy: 'head_coach' },
          { name: 'Taper', endDate: '2027-06-01', authoredBy: 'coach_ai' },
        ],
      }),
    );

    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('head-coach-owned');

    expect(callCoach).not.toHaveBeenCalled();
    expect(casUpdateBlockSet).not.toHaveBeenCalled();
  });
});

describe('ensureBlocksAdjusted — a valid reply is written once, as the Coach', () => {
  it('inserts the set with every block coach_ai and announces it in the same write', async () => {
    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('drafted');

    expect(insertBlockSet).toHaveBeenCalledTimes(1);
    const params = insertBlockSet.mock.calls[0][0];
    expect(params.athleteId).toBe(ATHLETE);
    expect(params.raceId).toBe(RACE.id);
    expect(params.startDate).toBe(TODAY);
    expect(params.blocks).toEqual(SHAPED);
    expect(params.blocks.every((b: TrainingBlockSpec) => b.authoredBy === 'coach_ai')).toBe(true);
    expect(params.events).toEqual([
      {
        actorType: 'coach_ai',
        actorId: null,
        type: 'blocks_drafted',
        payload: {
          raceId: RACE.id,
          raceName: RACE.name,
          blocks: SHAPED.map(({ name, endDate }) => ({ name, endDate })),
        },
      },
    ]);
  });

  it('offers exactly the adjust tool, and briefs from the arithmetic draft', async () => {
    await ensureBlocksAdjusted(ATHLETE, TODAY);

    const call = callCoach.mock.calls[0][0];
    expect(call.tools.map((t: { name: string }) => t.name)).toEqual(['adjust_training_blocks']);
    expect(call.system).toContain('Block 1 of 6');
    expect(call.system).toContain('Ironman Copenhagen on 2027-08-15');
  });

  it('replaces a stale set that has no Head Coach block, by CAS against the version it read', async () => {
    // Same race id (a race-date change updates the row in place), so a plain
    // insert would lose on the unique index forever. The CAS is the replace.
    getBlockSet.mockResolvedValue(
      storedSet({ version: 4, blocks: SHAPED.map((b) => ({ ...b, endDate: '2027-06-01' })) }),
    );

    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('drafted');

    expect(insertBlockSet).not.toHaveBeenCalled();
    expect(casUpdateBlockSet).toHaveBeenCalledTimes(1);
    const params = casUpdateBlockSet.mock.calls[0][0];
    expect(params).toMatchObject({ athleteId: ATHLETE, setId: 'set-1', expectedVersion: 4, blocks: SHAPED });
    expect(params.events.map((e: { type: string }) => e.type)).toEqual(['blocks_drafted']);
    // The new blocks were validated against today, so the row's start moves
    // too — or block 1 would be expanded from the old start and read as weeks
    // longer than it is (review of 07, 2026-09-15).
    expect(params.startDate).toBe(TODAY);
  });

  it('writes a second coach_ai event when the Coach flags the race unrealistic — and still writes the blocks', async () => {
    callCoach.mockResolvedValue(
      toolReply({
        blocks: SHAPED.map(({ name, endDate }) => ({ name, endDate })),
        unrealistic: { reason: 'eleven months is short for a first full distance' },
      }),
    );

    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('drafted');

    expect(insertBlockSet).toHaveBeenCalledTimes(1);
    // Both sentences in the one write, so a lost race loses neither and a
    // verdict cannot vanish between two statements.
    expect(insertBlockSet.mock.calls[0][0].events).toEqual([
      expect.objectContaining({ type: 'blocks_drafted' }),
      {
        actorType: 'coach_ai',
        actorId: null,
        type: 'race_flagged_unrealistic',
        payload: {
          raceId: RACE.id,
          raceName: RACE.name,
          reason: 'eleven months is short for a first full distance',
        },
      },
    ]);
  });
});

describe('ensureBlocksAdjusted — the athlete is never worse off than stage 1', () => {
  it('writes nothing on a reply the validator refuses, and logs why', async () => {
    callCoach.mockResolvedValue(
      toolReply({ blocks: [{ name: 'Block 1', endDate: '2027-01-10' }, { name: 'Taper', endDate: RACE.date }] }),
    );

    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('refused');

    expect(insertBlockSet).not.toHaveBeenCalled();
    expect(logBlockAdjustmentRefused).toHaveBeenCalledWith(ATHLETE, 'positional');
  });

  it('writes nothing when the Coach calls no tool or a malformed one', async () => {
    callCoach.mockResolvedValue({ text: 'Looks good to me.', toolCalls: [] });
    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('malformed');

    callCoach.mockResolvedValue(toolReply({ blocks: 'four' }));
    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('malformed');

    expect(insertBlockSet).not.toHaveBeenCalled();
    expect(logBlockAdjustmentRefused).toHaveBeenCalledTimes(2);
  });

  it('writes nothing and logs when the Coach call throws — never rethrows', async () => {
    callCoach.mockRejectedValue(new Error('upstream'));

    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('coach-failed');

    expect(insertBlockSet).not.toHaveBeenCalled();
    expect(logCoachFailure).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'block_adjustment', athleteId: ATHLETE }),
    );
  });

  it('writes no event and does not throw when the insert loses the unique-index race', async () => {
    insertBlockSet.mockResolvedValue('exists');
    callCoach.mockResolvedValue(
      toolReply({
        blocks: SHAPED.map(({ name, endDate }) => ({ name, endDate })),
        unrealistic: { reason: 'too short' },
      }),
    );

    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('lost-race');

    // Both events rode inside the one insert statement, gated there; nothing
    // else is written by a run that wrote no set.
    expect(casUpdateBlockSet).not.toHaveBeenCalled();
    expect(insertBlockSet).toHaveBeenCalledTimes(1);
  });

  it('leaves the resolved blocks as the arithmetic draft after a refused reply', async () => {
    const { blocks } = await getResolvedBlocks(ATHLETE, TODAY);
    expect(blocks).toEqual(trainingBlocks(TODAY, RACE.date));
  });
});

describe('getResolvedBlocks — the one read seam', () => {
  it('returns the race, the stored set expanded, and the set itself', async () => {
    getBlockSet.mockResolvedValue(storedSet());

    const view = await getResolvedBlocks(ATHLETE, TODAY);

    expect(view.race).toEqual(RACE);
    expect(view.set?.version).toBe(1);
    expect(view.blocks.map((b) => b.name)).toEqual(SHAPED.map((b) => b.name));
    expect(view.blocks[0].startDate).toBe('2026-09-01');
  });

  it('returns no blocks and no set for an athlete with no race, without reading sets', async () => {
    getTargetRace.mockResolvedValue(null);

    expect(await getResolvedBlocks(ATHLETE, TODAY)).toEqual({ race: null, set: null, blocks: [] });
    expect(getBlockSet).not.toHaveBeenCalled();
  });
});

describe('ensureBlocksAdjusted — the edges the gate and the briefing turn on', () => {
  it('adjusts a race exactly eight weeks out, and not one day less', async () => {
    getTargetRace.mockResolvedValue({ ...RACE, date: '2026-11-09' }); // 8 weeks from 2026-09-14
    callCoach.mockResolvedValue(
      toolReply({ blocks: [{ name: 'Sharpen', endDate: '2026-10-11' }, { name: 'Taper', endDate: '2026-11-09' }] }),
    );
    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('drafted');

    getTargetRace.mockResolvedValue({ ...RACE, date: '2026-11-08' });
    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('too-close');
  });

  it('treats a stored set with no blocks as open, and replaces it by CAS', async () => {
    getBlockSet.mockResolvedValue(storedSet({ blocks: [], version: 2 }));

    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('drafted');

    expect(casUpdateBlockSet).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 2 }));
  });

  it('briefs with the reflections of the last four weeks only, not today’s and not older', async () => {
    const rated = (date: string, comment: string) => ({
      id: `s-${date}`,
      athleteId: ATHLETE,
      date,
      type: 'Endurance',
      status: 'completed',
      feedbackBody: 4,
      feedbackMind: 4,
      feedbackComment: comment,
    });
    getSessionsForAthlete.mockResolvedValue([
      rated('2026-08-16', 'too-old'), // 29 days back
      rated('2026-08-17', 'oldest-in'), // 28 days back
      rated('2026-09-13', 'yesterday'),
      rated('2026-09-14', 'today-excluded'),
    ]);

    await ensureBlocksAdjusted(ATHLETE, TODAY);

    const system = callCoach.mock.calls[0][0].system as string;
    expect(system).toContain('oldest-in');
    expect(system).toContain('yesterday');
    expect(system).not.toContain('too-old');
    expect(system).not.toContain('today-excluded');
  });

  it('says the experience is not stated when the athlete row is missing or blank', async () => {
    getAthleteById.mockResolvedValue(undefined);
    await ensureBlocksAdjusted(ATHLETE, TODAY);
    expect(callCoach.mock.calls[0][0].system).toContain('Experience: not stated');

    getAthleteById.mockResolvedValue({ id: ATHLETE, experienceLevel: null });
    await ensureBlocksAdjusted(ATHLETE, TODAY);
    expect(callCoach.mock.calls[1][0].system).toContain('Experience: not stated');
  });

  it('asks with one user turn, the adjust tool, and the one-word acknowledgement', async () => {
    await ensureBlocksAdjusted(ATHLETE, TODAY);
    const call = callCoach.mock.calls[0][0];
    expect(call.messages).toEqual([{ role: 'user', content: 'Shape the training blocks now.' }]);
    expect(call.toolResult).toBe('Recorded. Reply with one word.');
    expect(call.maxTokens).toBe(800);
  });

  it('treats a call to some other tool as no adjustment', async () => {
    callCoach.mockResolvedValue({
      text: '',
      toolCalls: [{ name: 'propose_week_plan', input: { blocks: SHAPED } }],
    });
    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('malformed');
    expect(logBlockAdjustmentRefused).toHaveBeenCalledWith(ATHLETE, 'malformed');
  });
});

/**
 * `training-architecture/08` — the Head Coach's edit through the service seam.
 */
describe('editBlockAsHeadCoach', () => {
  const COACH = 'coach-1';
  const edit = (over: Partial<Parameters<typeof editBlockAsHeadCoach>[0]> = {}) =>
    editBlockAsHeadCoach({
      headCoachId: COACH,
      athleteId: ATHLETE,
      raceId: RACE.id,
      position: 1,
      input: { name: 'Long Rides' },
      expectedVersion: 1,
      today: TODAY,
      ...over,
    });

  beforeEach(() => {
    getActiveLink.mockResolvedValue({ id: 'l1', coachId: COACH, athleteId: ATHLETE, status: 'active' });
    getBlockSet.mockResolvedValue(storedSet());
    casUpdateBlockSet.mockResolvedValue({ ok: true, version: 2 });
  });

  it('refuses with not-linked and writes nothing — not even a read of the set', async () => {
    getActiveLink.mockResolvedValue(undefined);

    expect(await edit()).toEqual({ ok: false, reason: 'not-linked' });

    expect(getBlockSet).not.toHaveBeenCalled();
    expect(insertBlockSet).not.toHaveBeenCalled();
    expect(casUpdateBlockSet).not.toHaveBeenCalled();
  });

  it('refuses with no-race when the athlete has no Target Race or the race id is not the target', async () => {
    getTargetRace.mockResolvedValue(null);
    expect(await edit()).toEqual({ ok: false, reason: 'no-race' });

    getTargetRace.mockResolvedValue(RACE);
    expect(await edit({ raceId: 'someone-elses-race' })).toEqual({ ok: false, reason: 'no-race' });
    expect(casUpdateBlockSet).not.toHaveBeenCalled();
  });

  it('materialises the arithmetic draft for an athlete with no set, then edits it — announcing only the edit', async () => {
    getBlockSet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        storedSet({
          version: 1,
          startDate: TODAY,
          blocks: trainingBlocks(TODAY, RACE.date).map(({ name, endDate, authoredBy }) => ({ name, endDate, authoredBy })),
        }),
      );

    const result = await edit({ expectedVersion: 99 });

    expect(result).toEqual({ ok: true, version: 2 });
    const inserted = insertBlockSet.mock.calls[0][0];
    expect(inserted.events).toBeUndefined();
    expect(inserted.startDate).toBe(TODAY);
    expect(inserted.blocks.every((b: TrainingBlockSpec) => b.authoredBy === 'arithmetic')).toBe(true);
    // The panel's version is meaningless for a set that did not exist; the
    // materialised set is at version 1 and that is what the CAS expects.
    const cas = casUpdateBlockSet.mock.calls[0][0];
    expect(cas.expectedVersion).toBe(1);
    expect(cas.events.map((e: { type: string }) => e.type)).toEqual(['block_edited']);
  });

  it('returns conflict with what won when the materialising insert loses to the Coach draft', async () => {
    getBlockSet.mockResolvedValueOnce(null).mockResolvedValueOnce(storedSet({ version: 1 }));
    insertBlockSet.mockResolvedValue('exists');

    const result = await edit();

    expect(result).toEqual({
      ok: false,
      reason: 'conflict',
      current: { version: 1, startDate: '2026-09-01', blocks: SHAPED },
    });
    expect(casUpdateBlockSet).not.toHaveBeenCalled();
  });

  it('returns invalid with the problem, writing nothing, when the edit is refused', async () => {
    expect(await edit({ input: { name: 'Block 1' } })).toEqual({ ok: false, reason: 'invalid', problem: 'positional' });
    expect(await edit({ position: 4, input: { endDate: '2027-08-01' } })).toEqual({
      ok: false,
      reason: 'invalid',
      problem: 'last-block-end',
    });
    expect(casUpdateBlockSet).not.toHaveBeenCalled();
  });

  it('writes the new set by CAS at the panel version, with the head_coach event in the same call', async () => {
    const result = await edit({ expectedVersion: 1, position: 2, input: { name: 'Long Rides', endDate: '2027-04-25' } });

    expect(result).toEqual({ ok: true, version: 2 });
    expect(casUpdateBlockSet).toHaveBeenCalledTimes(1);
    const cas = casUpdateBlockSet.mock.calls[0][0];
    expect(cas).toMatchObject({ athleteId: ATHLETE, setId: 'set-1', expectedVersion: 1 });
    expect(cas.blocks[1]).toEqual({ name: 'Long Rides', endDate: '2027-04-25', authoredBy: 'head_coach' });
    expect(cas.blocks[0]).toEqual(SHAPED[0]);
    expect(cas.events).toEqual([
      {
        actorType: 'head_coach',
        actorId: COACH,
        type: 'block_edited',
        payload: {
          raceId: RACE.id,
          position: 2,
          from: { name: 'Sharpen the Bike', endDate: '2027-05-02' },
          to: { name: 'Long Rides', endDate: '2027-04-25' },
        },
      },
    ]);
  });

  it('returns conflict carrying the current set when the version had moved', async () => {
    casUpdateBlockSet.mockResolvedValue({ ok: false, reason: 'conflict' });
    getBlockSet.mockResolvedValueOnce(storedSet({ version: 3 })).mockResolvedValueOnce(storedSet({ version: 4 }));

    expect(await edit({ expectedVersion: 3 })).toEqual({
      ok: false,
      reason: 'conflict',
      current: { version: 4, startDate: '2026-09-01', blocks: SHAPED },
    });
  });

  it('falls back to the set it read when the conflict re-read finds nothing', async () => {
    casUpdateBlockSet.mockResolvedValue({ ok: false, reason: 'conflict' });
    getBlockSet.mockResolvedValueOnce(storedSet({ version: 3 })).mockResolvedValueOnce(null);

    expect(await edit({ expectedVersion: 3 })).toMatchObject({ ok: false, reason: 'conflict', current: { version: 3 } });
  });

  it('refuses stale-set, writing nothing, when the stored set no longer ends on race day', async () => {
    // The race moved after the set was written. `resolveBlocks` shows the coach
    // the arithmetic draft, but the stored rows are the old set — an edit by
    // position would land on blocks the coach never saw and the CAS would let
    // it through, because the version matches (review of 08, 2026-09-15).
    getBlockSet.mockResolvedValue(storedSet({ blocks: SHAPED.map((b, i, all) => i === all.length - 1 ? { ...b, endDate: '2027-08-01' } : b) }));

    const result = await edit({ expectedVersion: 1 });

    expect(result).toEqual({ ok: false, reason: 'stale-set' });
    expect(casUpdateBlockSet).not.toHaveBeenCalled();
    expect(insertBlockSet).not.toHaveBeenCalled();
  });

  it('uses the panel version, not the stored one, when the set already existed', async () => {
    getBlockSet.mockResolvedValue(storedSet({ version: 1 }));

    await edit({ expectedVersion: 7 });

    expect(casUpdateBlockSet.mock.calls[0][0].expectedVersion).toBe(7);
  });

  it('refuses to edit a stored set once race day has come, writing nothing', async () => {
    getTargetRace.mockResolvedValue({ ...RACE, date: TODAY });
    getBlockSet.mockResolvedValue(storedSet({ blocks: SHAPED.map((b, i) => (i === 3 ? { ...b, endDate: TODAY } : b)) }));

    expect(await edit()).toEqual({ ok: false, reason: 'no-race' });

    expect(getBlockSet).not.toHaveBeenCalled();
    expect(casUpdateBlockSet).not.toHaveBeenCalled();
  });

  it('answers no-race for a race already run, and when the materialised set cannot be read back', async () => {
    getTargetRace.mockResolvedValue({ ...RACE, date: '2026-09-01' });
    getBlockSet.mockResolvedValue(null);
    expect(await edit()).toEqual({ ok: false, reason: 'no-race' });
    expect(insertBlockSet).not.toHaveBeenCalled();

    getTargetRace.mockResolvedValue(RACE);
    getBlockSet.mockResolvedValue(null);
    expect(await edit()).toEqual({ ok: false, reason: 'no-race' });
    expect(insertBlockSet).toHaveBeenCalledTimes(1);
  });

  it('after a Head Coach edit, the Coach adjustment is a no-op for that race', async () => {
    // 08's own guarantee, pinned here rather than left to 07's test: the set
    // the edit produced is what the gate reads.
    getBlockSet.mockResolvedValue(
      storedSet({ blocks: [{ ...SHAPED[0], name: 'Long Rides', authoredBy: 'head_coach' }, ...SHAPED.slice(1)] }),
    );

    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('already-adjusted');
    getBlockSet.mockResolvedValue(
      storedSet({ blocks: [{ ...SHAPED[0], name: 'Long Rides', authoredBy: 'head_coach' }, { ...SHAPED[3], endDate: '2027-06-01' }] }),
    );
    expect(await ensureBlocksAdjusted(ATHLETE, TODAY)).toBe('head-coach-owned');
    expect(callCoach).not.toHaveBeenCalled();
  });
});
