import { describe, it, expect, vi, beforeEach } from 'vitest';

// Each repository function issues exactly one query, so one queued result set
// per call suffices. The chain object is thenable: every builder method returns
// it, and awaiting it resolves the queued rows — enough to exercise the JS the
// repository actually owns (name resolution, undefined-on-empty), without
// re-asserting drizzle's own SQL generation.
let nextRows: unknown[] = [];
/** Every `.set(...)` payload passed to an update chain, in call order. */
let updateCalls: unknown[] = [];
const CHAIN_METHODS = [
  'select',
  'from',
  'where',
  'innerJoin',
  'leftJoin',
  'orderBy',
  'limit',
  'update',
] as const;

function chain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  for (const m of CHAIN_METHODS) c[m] = () => c;
  // Not an identity method like the rest: `.set()` is where an update chain's
  // payload actually is, so it is captured rather than discarded.
  c.set = (v: unknown) => {
    updateCalls.push(v);
    return c;
  };
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    Promise.resolve(nextRows).then(resolve);
  return c;
}

vi.mock('@/db', () => ({ getDb: () => chain() }));

const {
  getCoachByUserId,
  getRoster,
  getActiveLink,
  getAthleteName,
  getLinkForAthlete,
  updateLinkVisibility,
  severLinkForAthlete,
} = await import('./coach-repository');

/** A stored coaching_link row, as the repository selects it. */
const linkRow = (over: Record<string, unknown> = {}) => ({
  id: 'link_1',
  coachId: 'coach_1',
  athleteId: 'a1',
  status: 'active',
  shareAthleteReports: true,
  shareAiTranscripts: false,
  createdAt: new Date('2026-07-01'),
  severedAt: null,
  ...over,
});

beforeEach(() => {
  nextRows = [];
  updateCalls = [];
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
      { link: linkRow({ id: 'l2', athleteId: 'a2', shareAthleteReports: true }), userName: null, syntheticLabel: 'Zed' },
      { link: linkRow({ id: 'l1', athleteId: 'a1', shareAthleteReports: false }), userName: 'Mads', syntheticLabel: null },
    ];
    const roster = await getRoster('coach_1');
    expect(roster.map((r) => r.name)).toEqual(['Mads', 'Zed']); // localeCompare sort
    expect(roster[0]).toEqual({
      athleteId: 'a1',
      name: 'Mads',
      link: {
        id: 'l1',
        coachId: 'coach_1',
        athleteId: 'a1',
        status: 'active',
        visibility: { shareAthleteReports: false, shareAiTranscripts: false },
      },
    });
  });

  it('falls back to a placeholder when neither name source is present', async () => {
    nextRows = [{ link: linkRow(), userName: null, syntheticLabel: null }];
    expect((await getRoster('coach_1'))[0].name).toBe('Unknown athlete');
  });

  it('an empty roster is an empty list, not an error', async () => {
    nextRows = [];
    expect(await getRoster('coach_1')).toEqual([]);
  });
});

describe('getActiveLink — the authorization gate', () => {
  it('returns the full Coaching Link when an active one exists', async () => {
    nextRows = [linkRow({ id: 'l1', shareAthleteReports: true, shareAiTranscripts: true })];
    expect(await getActiveLink('coach_1', 'a1')).toEqual({
      id: 'l1',
      coachId: 'coach_1',
      athleteId: 'a1',
      status: 'active',
      visibility: { shareAthleteReports: true, shareAiTranscripts: true },
    });
  });

  it('returns undefined when no active link joins the pair (no link or severed)', async () => {
    // The query filters status = active, so a severed link is simply not
    // returned — severing revokes by producing this same empty result.
    nextRows = [];
    expect(await getActiveLink('coach_1', 'a_stranger')).toBeUndefined();
  });
});

describe('getActiveLink / getRoster — status is fail-closed', () => {
  it('toCoachingLink treats any non-active stored status as severed', async () => {
    // A defensive belt: even if a row with an unexpected status reached this
    // path, it resolves to severed rather than leaking access.
    nextRows = [linkRow({ status: 'weird_value' })];
    expect((await getActiveLink('coach_1', 'a1'))!.status).toBe('severed');
  });
});

describe('getLinkForAthlete — the athlete reading their own link', () => {
  it('returns the head coach name alongside the link when active', async () => {
    nextRows = [
      {
        link: linkRow({ shareAthleteReports: true, shareAiTranscripts: true }),
        coachUserName: 'Lars Nielsen',
      },
    ];
    expect(await getLinkForAthlete('a1')).toEqual({
      headCoachName: 'Lars Nielsen',
      link: {
        id: 'link_1',
        coachId: 'coach_1',
        athleteId: 'a1',
        status: 'active',
        visibility: { shareAthleteReports: true, shareAiTranscripts: true },
      },
    });
  });

  it('is undefined when solo — no link, or a severed one', async () => {
    nextRows = [];
    expect(await getLinkForAthlete('a1')).toBeUndefined();
  });
});

describe('updateLinkVisibility', () => {
  it('writes exactly the changes given', async () => {
    await updateLinkVisibility('a1', { shareAiTranscripts: true });
    expect(updateCalls).toContainEqual({ shareAiTranscripts: true });
  });

  it('can set either flag independently', async () => {
    await updateLinkVisibility('a1', { shareAthleteReports: false });
    expect(updateCalls).toContainEqual({ shareAthleteReports: false });
  });
});

describe('severLinkForAthlete', () => {
  it('marks the link severed and stamps when', async () => {
    await severLinkForAthlete('a1');
    expect(updateCalls).toHaveLength(1);
    const written = updateCalls[0] as { status: string; severedAt: Date };
    expect(written.status).toBe('severed');
    expect(written.severedAt).toBeInstanceOf(Date);
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

describe('getSharedTranscripts — gated on the link', () => {
  it('returns null without an active link — nothing is read', async () => {
    const { getSharedTranscripts } = await import('./coach-repository');
    expect(await getSharedTranscripts(undefined)).toBeNull();
  });

  it('returns null when share_ai_transcripts is off — withheld, not fetched', async () => {
    const { getSharedTranscripts } = await import('./coach-repository');
    const link = {
      id: 'l1',
      coachId: 'coach_1',
      athleteId: 'a1',
      status: 'active' as const,
      visibility: { shareAthleteReports: true, shareAiTranscripts: false },
    };
    expect(await getSharedTranscripts(link)).toBeNull();
  });

  it('with the flag on, groups messages by conversation in seq order', async () => {
    const { getSharedTranscripts } = await import('./coach-repository');
    // The kind filter is in the SQL WHERE now, so only shared kinds arrive
    // here; this proves the grouping/ordering the repository owns in JS.
    nextRows = [
      { conversationId: 'c1', kind: 'coach_chat', createdAt: new Date('2026-07-01'), role: 'athlete', content: 'hi', seq: 0 },
      { conversationId: 'c1', kind: 'coach_chat', createdAt: new Date('2026-07-01'), role: 'coach_ai', content: 'hello', seq: 1 },
      { conversationId: 'c2', kind: 'weekly_session', createdAt: new Date('2026-07-02'), role: 'athlete', content: 'plan?', seq: 0 },
    ];
    const link = {
      id: 'l1',
      coachId: 'coach_1',
      athleteId: 'a1',
      status: 'active' as const,
      visibility: { shareAthleteReports: true, shareAiTranscripts: true },
    };
    const result = await getSharedTranscripts(link);
    expect(result?.map((c) => c.conversationId)).toEqual(['c1', 'c2']);
    expect(result?.[0].messages).toHaveLength(2);
    expect(result?.[0].messages.map((m) => m.content)).toEqual(['hi', 'hello']);
  });

  it('a severed link (should it ever reach here) is refused before any read', async () => {
    const { getSharedTranscripts } = await import('./coach-repository');
    const severed = {
      id: 'l1',
      coachId: 'coach_1',
      athleteId: 'a1',
      status: 'severed' as const,
      visibility: { shareAthleteReports: true, shareAiTranscripts: true },
    };
    expect(await getSharedTranscripts(severed)).toBeNull();
  });
});
