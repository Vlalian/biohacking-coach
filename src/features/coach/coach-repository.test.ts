import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { athlete, coach, coachingLink, conversations, messages } from '@/db/schema';
import { user } from '@/db/auth-schema';
import { createTestDatabase, seedAthlete, type TestDatabase } from '@/test/pglite';

/**
 * The coach roster and the Coaching Link, against a real Postgres
 * (`src/test/pglite.ts`, `code-health/30`). A severed link revokes access by
 * construction — no query returns its row (ADR 0006, ADR 0003) — so most tests
 * here store a severed link beside an active one and check it stays invisible.
 */

let testDb: TestDatabase;
vi.mock('@/db', () => ({ getDb: () => testDb.db }));

const {
  getCoachByUserId,
  getRoster,
  getActiveLink,
  getAthleteName,
  getLinkForAthlete,
  updateLinkVisibility,
  severLinkForAthlete,
  holdsActiveCoachingLinks,
  updateCoachInformationViewLayout,
  getSharedTranscripts,
  resolveAthleteName,
} = await import('./coach-repository');

beforeAll(async () => {
  testDb = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await testDb.reset();
});

/** A Head Coach: a user holding a coach row. Returns the coach id. */
async function aCoach(tag: string, uiPrefs: Record<string, unknown> | null = null): Promise<string> {
  await testDb.db.insert(user).values({ id: `user_${tag}`, name: `Coach ${tag}`, email: `${tag}@test.invalid`, uiPrefs });
  const [row] = await testDb.db.insert(coach).values({ userId: `user_${tag}` }).returning({ id: coach.id });
  return row.id;
}

/** An athlete with no user row — the synthetic kind, named by its label. */
async function aSyntheticAthlete(label: string): Promise<string> {
  const [row] = await testDb.db.insert(athlete).values({ syntheticLabel: label }).returning({ id: athlete.id });
  return row.id;
}

async function aLink(
  coachId: string,
  athleteId: string,
  over: Partial<typeof coachingLink.$inferInsert> = {},
): Promise<string> {
  const [row] = await testDb.db
    .insert(coachingLink)
    .values({ coachId, athleteId, ...over })
    .returning({ id: coachingLink.id });
  return row.id;
}

async function linkRow(id: string) {
  const [row] = await testDb.db.select().from(coachingLink).where(eq(coachingLink.id, id));
  return row;
}

describe('getCoachByUserId', () => {
  it('resolves the coach a user owns, with its layout', async () => {
    const coachId = await aCoach('lars');
    await testDb.db.update(coach).set({ informationViewLayout: { favorites: ['hrv'], range: '4w' } });

    expect(await getCoachByUserId('user_lars')).toEqual({
      id: coachId,
      informationViewLayout: { favorites: ['hrv'], range: '4w' },
    });
  });

  it('is undefined for a user who holds no coach row', async () => {
    await seedAthlete(testDb.db, 'solo');
    expect(await getCoachByUserId('user_solo')).toBeUndefined();
  });

  it('resolves a coach for a user who is also an athlete — the dual-role person', async () => {
    // The coach lookup keys off `coach` alone, so an athlete row on the same
    // user neither requires nor excludes it (route ticket 05, ballot 1).
    await seedAthlete(testDb.db, 'mads');
    const [row] = await testDb.db.insert(coach).values({ userId: 'user_mads' }).returning({ id: coach.id });

    expect((await getCoachByUserId('user_mads'))?.id).toBe(row.id);
  });
});

describe('holdsActiveCoachingLinks — whether the drawer shows a Roster', () => {
  it('is true for a coach with an active link', async () => {
    await aLink(await aCoach('lars'), await seedAthlete(testDb.db, 'a'));
    expect(await holdsActiveCoachingLinks('user_lars')).toBe(true);
  });

  it('is false for a coach whose only link is severed', async () => {
    await aLink(await aCoach('lars'), await seedAthlete(testDb.db, 'a'), { status: 'severed' });
    expect(await holdsActiveCoachingLinks('user_lars')).toBe(false);
  });

  it('is false for a coach with no links, and for a user who is no coach', async () => {
    await aCoach('lars');
    await seedAthlete(testDb.db, 'solo');
    expect(await holdsActiveCoachingLinks('user_lars')).toBe(false);
    expect(await holdsActiveCoachingLinks('user_solo')).toBe(false);
  });

  it('does not count another coach’s links', async () => {
    await aCoach('lars');
    await aLink(await aCoach('sarah'), await seedAthlete(testDb.db, 'a'));
    expect(await holdsActiveCoachingLinks('user_lars')).toBe(false);
  });
});

describe('getRoster — names resolved through the user seam', () => {
  it('lists every active athlete, named by user.name or synthetic_label, sorted by name', async () => {
    const coachId = await aCoach('lars');
    const zed = await aSyntheticAthlete('Zed');
    const mads = await seedAthlete(testDb.db, 'Mads');
    // Linked Zed first, so the order read back is the sort's, not the insert's.
    await aLink(coachId, zed);
    const madsLink = await aLink(coachId, mads, { shareAthleteReports: false, shareAiTranscripts: true });

    const roster = await getRoster(coachId);

    expect(roster.map((r) => r.name)).toEqual(['Mads', 'Zed']);
    expect(roster[0]).toEqual({
      athleteId: mads,
      name: 'Mads',
      link: {
        id: madsLink,
        coachId,
        athleteId: mads,
        status: 'active',
        visibility: { shareAthleteReports: false, shareAiTranscripts: true },
      },
    });
  });

  it('orders by name whatever order the athletes were stored or linked in', async () => {
    const coachId = await aCoach('lars');
    const cecilie = await aSyntheticAthlete('Cecilie');
    const aske = await aSyntheticAthlete('Aske');
    const birk = await aSyntheticAthlete('Birk');
    for (const id of [birk, cecilie, aske]) await aLink(coachId, id);

    expect((await getRoster(coachId)).map((r) => r.name)).toEqual(['Aske', 'Birk', 'Cecilie']);
  });

  it('leaves out severed links and other coaches’ athletes', async () => {
    const lars = await aCoach('lars');
    const sarah = await aCoach('sarah');
    await aLink(lars, await aSyntheticAthlete('Gone'), { status: 'severed' });
    await aLink(sarah, await aSyntheticAthlete('Theirs'));
    await aLink(lars, await aSyntheticAthlete('Mine'));

    expect((await getRoster(lars)).map((r) => r.name)).toEqual(['Mine']);
  });

  it('falls back to a placeholder when neither name source is present', () => {
    // The `athlete_identity_source` check makes such a row unstorable, so the
    // rule every read shares is asked directly: the belt behind that check.
    expect(resolveAthleteName(null, null)).toBe('Unknown athlete');
    expect(resolveAthleteName('Mads', 'Zed')).toBe('Mads');
  });

  it('an empty roster is an empty list, not an error', async () => {
    expect(await getRoster(await aCoach('lars'))).toEqual([]);
  });
});

describe('getActiveLink — the authorization gate', () => {
  it('returns the full Coaching Link when an active one joins the pair', async () => {
    const coachId = await aCoach('lars');
    const athleteId = await seedAthlete(testDb.db, 'a');
    const id = await aLink(coachId, athleteId, { shareAiTranscripts: true });

    expect(await getActiveLink(coachId, athleteId)).toEqual({
      id,
      coachId,
      athleteId,
      status: 'active',
      visibility: { shareAthleteReports: true, shareAiTranscripts: true },
    });
  });

  it('is undefined for a severed link — severing revokes by producing no row', async () => {
    const coachId = await aCoach('lars');
    const athleteId = await seedAthlete(testDb.db, 'a');
    await aLink(coachId, athleteId, { status: 'severed' });

    expect(await getActiveLink(coachId, athleteId)).toBeUndefined();
  });

  it('is undefined for an athlete linked to someone else, and for a coach linked to someone else', async () => {
    const lars = await aCoach('lars');
    const sarah = await aCoach('sarah');
    const mine = await seedAthlete(testDb.db, 'mine');
    const theirs = await seedAthlete(testDb.db, 'theirs');
    await aLink(lars, mine);
    await aLink(sarah, theirs);

    expect(await getActiveLink(lars, theirs)).toBeUndefined();
    expect(await getActiveLink(sarah, mine)).toBeUndefined();
  });
});

describe('getLinkForAthlete — the athlete reading their own link', () => {
  it('returns the link with the Head Coach’s account name and preferred name (training-architecture/42)', async () => {
    const coachId = await aCoach('sarah', { preferredName: 'Coach B', language: 'da' });
    const athleteId = await seedAthlete(testDb.db, 'a');
    const id = await aLink(coachId, athleteId, { shareAiTranscripts: true });

    expect(await getLinkForAthlete(athleteId)).toEqual({
      headCoachName: 'Coach sarah',
      headCoachPreferredName: 'Coach B',
      link: {
        id,
        coachId,
        athleteId,
        status: 'active',
        visibility: { shareAthleteReports: true, shareAiTranscripts: true },
      },
    });
  });

  it('the preferred name is null when the coach never set one, whatever their prefs hold', async () => {
    for (const [tag, prefs] of [['n', null], ['e', {}], ['l', { language: 'en' }]] as const) {
      const athleteId = await seedAthlete(testDb.db, `athlete_${tag}`);
      await aLink(await aCoach(tag, prefs), athleteId);
      expect((await getLinkForAthlete(athleteId))?.headCoachPreferredName).toBeNull();
    }
  });

  it('is undefined when solo — no link, or a severed one', async () => {
    const solo = await seedAthlete(testDb.db, 'solo');
    const severed = await seedAthlete(testDb.db, 'severed');
    await aLink(await aCoach('lars'), severed, { status: 'severed' });

    expect(await getLinkForAthlete(solo)).toBeUndefined();
    expect(await getLinkForAthlete(severed)).toBeUndefined();
  });

  it('shows the newest link if the athlete somehow holds two', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    await aLink(await aCoach('old'), athleteId, { createdAt: new Date('2026-01-01') });
    await aLink(await aCoach('new'), athleteId, { createdAt: new Date('2026-06-01') });

    expect((await getLinkForAthlete(athleteId))?.headCoachName).toBe('Coach new');
  });
});

describe('updateLinkVisibility — scoped to the athlete’s own active link', () => {
  it('writes exactly the flag given and leaves the other', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const id = await aLink(await aCoach('lars'), athleteId);

    await updateLinkVisibility(athleteId, { shareAiTranscripts: true });

    expect(await linkRow(id)).toMatchObject({ shareAiTranscripts: true, shareAthleteReports: true });
  });

  it('touches neither another athlete’s link nor the athlete’s own severed one', async () => {
    const coachId = await aCoach('lars');
    const athleteId = await seedAthlete(testDb.db, 'a');
    const other = await seedAthlete(testDb.db, 'b');
    const severed = await aLink(coachId, athleteId, { status: 'severed' });
    const theirs = await aLink(coachId, other);

    await updateLinkVisibility(athleteId, { shareAthleteReports: false });

    expect((await linkRow(severed)).shareAthleteReports).toBe(true);
    expect((await linkRow(theirs)).shareAthleteReports).toBe(true);
  });
});

describe('severLinkForAthlete', () => {
  it('marks the athlete’s active link severed, stamps when, and keeps the row', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const coachId = await aCoach('lars');
    const id = await aLink(coachId, athleteId);

    await severLinkForAthlete(athleteId);

    const row = await linkRow(id);
    expect(row.status).toBe('severed');
    expect(row.severedAt).toBeInstanceOf(Date);
    expect(await getActiveLink(coachId, athleteId)).toBeUndefined();
  });

  it('leaves other athletes’ links active', async () => {
    const coachId = await aCoach('lars');
    const mine = await seedAthlete(testDb.db, 'a');
    const theirs = await seedAthlete(testDb.db, 'b');
    await aLink(coachId, mine);
    const id = await aLink(coachId, theirs);

    await severLinkForAthlete(mine);

    expect((await linkRow(id)).status).toBe('active');
  });
});

describe('getAthleteName', () => {
  it('resolves a real athlete’s user name, a synthetic one’s label, and undefined for no athlete', async () => {
    const real = await seedAthlete(testDb.db, 'Mads');
    const synthetic = await aSyntheticAthlete('Zed');

    expect(await getAthleteName(real)).toBe('Mads');
    expect(await getAthleteName(synthetic)).toBe('Zed');
    expect(await getAthleteName('00000000-0000-4000-8000-000000000000')).toBeUndefined();
  });
});

describe('updateCoachInformationViewLayout', () => {
  it('stores the one roster-wide layout on that coach only', async () => {
    const lars = await aCoach('lars');
    await aCoach('sarah');

    await updateCoachInformationViewLayout(lars, { favorites: ['sleep'], range: '8w' });

    expect((await getCoachByUserId('user_lars'))?.informationViewLayout).toEqual({ favorites: ['sleep'], range: '8w' });
    expect((await getCoachByUserId('user_sarah'))?.informationViewLayout).toBeNull();
  });
});

describe('getSharedTranscripts — gated on the link', () => {
  const link = (athleteId: string, over: { status?: 'active' | 'severed'; shareAiTranscripts?: boolean } = {}) => ({
    id: 'l1',
    coachId: 'c1',
    athleteId,
    status: over.status ?? ('active' as const),
    visibility: { shareAthleteReports: true, shareAiTranscripts: over.shareAiTranscripts ?? true },
  });

  async function aConversation(athleteId: string, kind: string, createdAt: string, lines: [string, string][]) {
    const [row] = await testDb.db
      .insert(conversations)
      .values({ athleteId, kind, createdAt: new Date(createdAt) })
      .returning({ id: conversations.id });
    // Stored out of order on purpose: the read orders by seq, not by insert.
    for (const [seq, [role, content]] of [...lines.entries()].reverse()) {
      await testDb.db.insert(messages).values({ conversationId: row.id, role, content, seq });
    }
    return row.id;
  }

  it('with the flag on, returns Coach Chat and Weekly Session transcripts, oldest first, messages in seq order', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const later = await aConversation(athleteId, 'weekly_session', '2026-07-02', [['athlete', 'plan?']]);
    const earlier = await aConversation(athleteId, 'coach_chat', '2026-07-01', [
      ['athlete', 'hi'],
      ['coach_ai', 'hello'],
    ]);

    expect(await getSharedTranscripts(link(athleteId))).toEqual([
      {
        conversationId: earlier,
        kind: 'coach_chat',
        createdAt: new Date('2026-07-01'),
        messages: [
          { role: 'athlete', content: 'hi', seq: 0 },
          { role: 'coach_ai', content: 'hello', seq: 1 },
        ],
      },
      {
        conversationId: later,
        kind: 'weekly_session',
        createdAt: new Date('2026-07-02'),
        messages: [{ role: 'athlete', content: 'plan?', seq: 0 }],
      },
    ]);
  });

  it('never serves a kind outside the Link Visibility contract, nor another athlete’s', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const other = await seedAthlete(testDb.db, 'b');
    await aConversation(athleteId, 'onboarding', '2026-07-01', [['athlete', 'private']]);
    await aConversation(other, 'coach_chat', '2026-07-01', [['athlete', 'theirs']]);

    expect(await getSharedTranscripts(link(athleteId))).toEqual([]);
  });

  it('is null — nothing read — without a link, with the flag off, or with a severed link', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    await aConversation(athleteId, 'coach_chat', '2026-07-01', [['athlete', 'hi']]);

    expect(await getSharedTranscripts(undefined)).toBeNull();
    expect(await getSharedTranscripts(link(athleteId, { shareAiTranscripts: false }))).toBeNull();
    expect(await getSharedTranscripts(link(athleteId, { status: 'severed' }))).toBeNull();
  });
});
