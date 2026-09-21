import { describe, it, expect, vi, beforeEach } from 'vitest';

const getStaleBlockSetsForHeadCoach = vi.fn();
vi.mock('./training-block-repository', () => ({ getStaleBlockSetsForHeadCoach }));

const { getCoachChores } = await import('./coach-chores-service');

describe('getCoachChores — the shell’s one read (training-architecture/19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStaleBlockSetsForHeadCoach.mockResolvedValue([]);
  });

  it('is exactly one repository read, keyed on the session’s user id', async () => {
    expect(await getCoachChores('user_coach')).toEqual([]);
    expect(getStaleBlockSetsForHeadCoach).toHaveBeenCalledTimes(1);
    expect(getStaleBlockSetsForHeadCoach).toHaveBeenCalledWith('user_coach');
  });

  it('turns each stale set into a chore', async () => {
    getStaleBlockSetsForHeadCoach.mockResolvedValue([
      {
        set: {
          id: 's1',
          athleteId: 'a1',
          raceId: 'r1',
          version: 2,
          startDate: '2026-09-14',
          blocks: [
            { name: 'Build', endDate: '2026-12-13', authoredBy: 'coach_ai' },
            { name: 'Taper', endDate: '2027-03-14', authoredBy: 'head_coach' },
          ],
        },
        athleteName: 'Sarah',
        raceName: 'IM',
        raceDate: '2027-04-04',
      },
    ]);

    expect(await getCoachChores('user_coach')).toEqual([
      expect.objectContaining({
        kind: 'repin-block-set',
        athleteId: 'a1',
        athleteName: 'Sarah',
        raceId: 'r1',
        raceName: 'IM',
        raceDate: '2027-04-04',
        lastBlockName: 'Taper',
        lastBlockEnd: '2027-03-14',
        version: 2,
        repair: { kind: 'repin' },
      }),
    ]);
  });
});
