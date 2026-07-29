import { describe, it, expect, vi, beforeEach } from 'vitest';

// Each repository function issues exactly one query, so one queued result set
// per call suffices. The chain object is thenable: every builder method returns
// it, and awaiting it resolves the queued rows — enough to exercise the JS the
// repository actually owns (name resolution, undefined-on-empty), without
// re-asserting drizzle's own SQL generation.
let nextRows: unknown[] = [];
const CHAIN_METHODS = [
  'select',
  'from',
  'where',
  'innerJoin',
  'leftJoin',
  'orderBy',
  'limit',
] as const;

function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  for (const m of CHAIN_METHODS) c[m] = () => c;
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    Promise.resolve(nextRows).then(resolve);
  return c;
}

vi.mock('@/db', () => ({ getDb: () => chain() }));

const { getCoachByUserId, getRoster, getActiveLink, getAthleteName } =
  await import('./coach-repository');

beforeEach(() => {
  nextRows = [];
});

describe('getCoachByUserId', () => {
  it('maps a row to the domain coach, dropping storage columns', async () => {
    nextRows = [{ id: 'coach_1', informationViewLayout: { favorites: [] } }];
    const coach = await getCoachByUserId('user_1');
    expect(coach).toEqual({ id: 'coach_1', informationViewLayout: { favorites: [] } });
  });

  it('returns undefined when the user holds no coach row', async () => {
    nextRows = [];
    expect(await getCoachByUserId('user_x')).toBeUndefined();
  });

  it('resolves a coach for a user who also holds an athlete row — the dual-role person', async () => {
    // Dual-role is structural: the coach lookup keys off the `coach` table
    // alone and never consults `athlete`, so the same user id resolves to a
    // coach here while `getAthleteByUserId` resolves the same user to an
    // athlete elsewhere. Both capacities work because the tables are
    // independent (route ticket 05, ballot 1). This is the query that proves
    // the coach half does not require — or exclude — an athlete row.
    nextRows = [{ id: 'coach_of_mads', informationViewLayout: null }];
    expect(await getCoachByUserId('mads_user_id')).toEqual({
      id: 'coach_of_mads',
      informationViewLayout: null,
    });
  });
});

describe('getRoster — names resolved through the user seam', () => {
  it('uses user.name for a real athlete, synthetic_label for a synthetic one, sorted', async () => {
    nextRows = [
      { athleteId: 'a2', userName: null, syntheticLabel: 'Zed', shareAthleteReports: true, shareAiTranscripts: false },
      { athleteId: 'a1', userName: 'Mads', syntheticLabel: null, shareAthleteReports: false, shareAiTranscripts: false },
    ];
    const roster = await getRoster('coach_1');
    expect(roster.map((r) => r.name)).toEqual(['Mads', 'Zed']); // localeCompare sort
    expect(roster[0]).toEqual({
      athleteId: 'a1',
      name: 'Mads',
      visibility: { shareAthleteReports: false, shareAiTranscripts: false },
    });
  });

  it('falls back to a placeholder when neither name source is present', async () => {
    nextRows = [
      { athleteId: 'a1', userName: null, syntheticLabel: null, shareAthleteReports: true, shareAiTranscripts: false },
    ];
    expect((await getRoster('coach_1'))[0].name).toBe('Unknown athlete');
  });

  it('an empty roster is an empty list, not an error', async () => {
    nextRows = [];
    expect(await getRoster('coach_1')).toEqual([]);
  });
});

describe('getActiveLink — the authorization gate', () => {
  it('returns the visibility flags when an active link exists', async () => {
    nextRows = [{ shareAthleteReports: true, shareAiTranscripts: false }];
    expect(await getActiveLink('coach_1', 'a1')).toEqual({
      shareAthleteReports: true,
      shareAiTranscripts: false,
    });
  });

  it('returns undefined when no active link joins the pair (no link or severed)', async () => {
    // The query filters status = active, so a severed link is simply not
    // returned — severing revokes by producing this same empty result.
    nextRows = [];
    expect(await getActiveLink('coach_1', 'a_stranger')).toBeUndefined();
  });
});

describe('getAthleteName', () => {
  it('resolves a name, or undefined when the athlete does not exist', async () => {
    nextRows = [{ userName: 'Mads', syntheticLabel: null }];
    expect(await getAthleteName('a1')).toBe('Mads');
    nextRows = [];
    expect(await getAthleteName('ghost')).toBeUndefined();
  });
});
