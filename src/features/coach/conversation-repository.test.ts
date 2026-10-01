import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { coach, conversations, messages } from '@/db/schema';
import { user } from '@/db/auth-schema';
import { createTestDatabase, seedAthlete, type TestDatabase } from '@/test/pglite';

/**
 * Coach conversations and their transcripts, against a real Postgres
 * (`src/test/pglite.ts`, `code-health/30`). What is asserted is what the
 * athlete or coach would read back: which conversations resolve for whom, and
 * the transcript in `seq` order. The unique (conversation_id, seq) index the
 * append leans on is the migrated one.
 */

let testDb: TestDatabase;
vi.mock('@/db', () => ({ getDb: () => testDb.db }));

const {
  createConversation,
  getOpenConversations,
  getLatestOpenConversation,
  endConversation,
  getOwnedConversation,
  getOwnedConversationWithMessages,
  appendMessages,
  createBriefing,
  getOwnedBriefing,
  appendBriefingMessages,
  getLatestBriefingWithMessages,
} = await import('./conversation-repository');

beforeAll(async () => {
  testDb = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  await testDb.reset();
});

const MISSING = '00000000-0000-4000-8000-000000000000';

async function aCoach(tag: string): Promise<string> {
  await testDb.db.insert(user).values({ id: `user_${tag}`, name: tag, email: `${tag}@test.invalid` });
  const [row] = await testDb.db.insert(coach).values({ userId: `user_${tag}` }).returning({ id: coach.id });
  return row.id;
}

/** A conversation stored at a known time, so "newest" is not left to the clock. */
async function aConversation(athleteId: string, kind: string, createdAt: string, endedAt: Date | null = null) {
  const [row] = await testDb.db
    .insert(conversations)
    .values({ athleteId, kind, createdAt: new Date(createdAt), endedAt })
    .returning({ id: conversations.id });
  return row.id;
}

const transcriptOf = async (conversationId: string) =>
  (await testDb.db.select().from(messages).where(eq(messages.conversationId, conversationId)))
    .sort((a, b) => a.seq - b.seq)
    .map((m) => ({ role: m.role, content: m.content, seq: m.seq }));

describe('createConversation', () => {
  it('stores an open conversation of the kind asked for, and never a Weekly Session number', async () => {
    // The column stays for the rows already written; the behavior that
    // numbered them is retired (`training-architecture/21`).
    const athleteId = await seedAthlete(testDb.db, 'a');

    const conv = await createConversation({ athleteId, kind: 'coach_chat' });

    expect(conv).toMatchObject({ athleteId, kind: 'coach_chat', weeklySessionNumber: null, endedAt: null });
    expect(await getOwnedConversation(athleteId, conv.id)).toEqual(conv);
  });
});

describe('open conversations — what the shell can restore', () => {
  it('lists every open conversation of the athlete, newest first, and none that ended', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const older = await aConversation(athleteId, 'coach_chat', '2026-07-01');
    const newer = await aConversation(athleteId, 'weekly_session', '2026-07-02');
    await aConversation(athleteId, 'coach_chat', '2026-07-03', new Date('2026-07-03'));

    expect((await getOpenConversations(athleteId)).map((c) => c.id)).toEqual([newer, older]);
  });

  it('does not list another athlete’s', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    await aConversation(await seedAthlete(testDb.db, 'b'), 'coach_chat', '2026-07-01');

    expect(await getOpenConversations(athleteId)).toEqual([]);
  });

  it('the latest open one of a kind is the newest still open, of that kind, of that athlete', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const other = await seedAthlete(testDb.db, 'b');
    await aConversation(athleteId, 'coach_chat', '2026-07-01');
    const latest = await aConversation(athleteId, 'coach_chat', '2026-07-02');
    await aConversation(athleteId, 'coach_chat', '2026-07-03', new Date('2026-07-03'));
    await aConversation(athleteId, 'onboarding', '2026-07-04');
    await aConversation(other, 'coach_chat', '2026-07-05');

    expect((await getLatestOpenConversation(athleteId, 'coach_chat'))?.id).toBe(latest);
  });

  it('the latest open one is null when there is none', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    expect(await getLatestOpenConversation(athleteId, 'coach_chat')).toBeNull();
  });
});

describe('endConversation', () => {
  it('ends the athlete’s own conversation', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const id = await aConversation(athleteId, 'coach_chat', '2026-07-01');
    const endedAt = new Date('2026-07-02T10:00:00Z');

    expect(await endConversation(athleteId, id, endedAt)).toBe(true);
    expect((await getOwnedConversation(athleteId, id))?.endedAt).toEqual(endedAt);
  });

  it('refuses another athlete’s conversation and leaves it open', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const theirs = await aConversation(await seedAthlete(testDb.db, 'b'), 'coach_chat', '2026-07-01');

    expect(await endConversation(athleteId, theirs, new Date())).toBe(false);
    const [row] = await testDb.db.select().from(conversations).where(eq(conversations.id, theirs));
    expect(row.endedAt).toBeNull();
  });
});

describe('getOwnedConversation — ownership is part of the read', () => {
  it('resolves only for the athlete who owns it', async () => {
    const owner = await seedAthlete(testDb.db, 'a');
    const stranger = await seedAthlete(testDb.db, 'b');
    const id = await aConversation(owner, 'coach_chat', '2026-07-01');

    expect((await getOwnedConversation(owner, id))?.id).toBe(id);
    expect(await getOwnedConversation(stranger, id)).toBeNull();
    expect(await getOwnedConversation(owner, MISSING)).toBeNull();
  });

  it('with messages: the transcript in seq order for the owner, nothing for anyone else', async () => {
    const owner = await seedAthlete(testDb.db, 'a');
    const stranger = await seedAthlete(testDb.db, 'b');
    const id = await aConversation(owner, 'coach_chat', '2026-07-01');
    await testDb.db.insert(messages).values([
      { conversationId: id, role: 'coach_ai', content: 'hello', seq: 1 },
      { conversationId: id, role: 'athlete', content: 'hi', seq: 0 },
    ]);

    const read = await getOwnedConversationWithMessages(owner, id);
    expect(read?.conversation.id).toBe(id);
    expect(read?.messages.map((m) => m.content)).toEqual(['hi', 'hello']);
    expect(await getOwnedConversationWithMessages(stranger, id)).toBeNull();
  });
});

describe('appendMessages — ownership and seq', () => {
  it('starts a transcript at seq 0 and continues past the highest stored', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const id = await aConversation(athleteId, 'coach_chat', '2026-07-01');

    const first = await appendMessages(athleteId, id, [{ role: 'athlete', content: 'ping' }]);
    const next = await appendMessages(athleteId, id, [
      { role: 'coach_ai', content: 'pong' },
      { role: 'athlete', content: 'again' },
    ]);

    expect(first?.map((m) => m.seq)).toEqual([0]);
    expect(next?.map((m) => m.seq)).toEqual([1, 2]);
    expect(await transcriptOf(id)).toEqual([
      { role: 'athlete', content: 'ping', seq: 0 },
      { role: 'coach_ai', content: 'pong', seq: 1 },
      { role: 'athlete', content: 'again', seq: 2 },
    ]);
  });

  it('counts only this conversation’s messages when numbering', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const busy = await aConversation(athleteId, 'onboarding', '2026-07-01');
    const id = await aConversation(athleteId, 'coach_chat', '2026-07-02');
    await appendMessages(athleteId, busy, [
      { role: 'athlete', content: 'a' },
      { role: 'athlete', content: 'b' },
    ]);

    expect((await appendMessages(athleteId, id, [{ role: 'athlete', content: 'c' }]))?.[0].seq).toBe(0);
  });

  it('appending nothing writes nothing and answers with nothing', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const id = await aConversation(athleteId, 'coach_chat', '2026-07-01');

    expect(await appendMessages(athleteId, id, [])).toEqual([]);
    expect(await transcriptOf(id)).toEqual([]);
  });

  it('refuses and writes nothing when the conversation is not the athlete’s', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const theirs = await aConversation(await seedAthlete(testDb.db, 'b'), 'coach_chat', '2026-07-01');

    expect(await appendMessages(athleteId, theirs, [{ role: 'athlete', content: 'let me in' }])).toBeNull();
    expect(await transcriptOf(theirs)).toEqual([]);
  });

  it('stores the sources the Coach drew on with the turn that used them, and none on other turns', async () => {
    // code-health/06: the references re-render identically a week later.
    const citation = {
      sourceId: 'src_1',
      slug: 'polarized-training',
      title: 'Polarized training intensity distribution',
      authors: 'Seiler S',
      year: 2019,
      url: 'https://doi.org/10.1000/example',
      licence: 'CC BY 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Seiler S (2019), CC BY 4.0',
      ordinals: [3],
    };
    const athleteId = await seedAthlete(testDb.db, 'a');
    const id = await aConversation(athleteId, 'coach_chat', '2026-07-01');

    const written = await appendMessages(athleteId, id, [
      { role: 'athlete', content: 'Why easy?' },
      { role: 'coach_ai', content: 'Thursday is easy on purpose.', citations: [citation] },
    ]);

    expect(written?.map((m) => m.citations)).toEqual([[], [citation]]);
    const read = await getOwnedConversationWithMessages(athleteId, id);
    expect(read?.messages.map((m) => m.citations)).toEqual([[], [citation]]);
  });

  it('two appends racing for the same seq both land, one after the other', async () => {
    // Read-max-then-insert is not atomic: both read "no messages yet" and both
    // try seq 0. The unique index refuses the second, which re-reads and lands
    // at seq 1 — a retry, not a corrupted transcript or a lost turn.
    const athleteId = await seedAthlete(testDb.db, 'a');
    const id = await aConversation(athleteId, 'coach_chat', '2026-07-01');

    await Promise.all([
      appendMessages(athleteId, id, [{ role: 'athlete', content: 'one' }]),
      appendMessages(athleteId, id, [{ role: 'athlete', content: 'two' }]),
    ]);

    const transcript = await transcriptOf(id);
    expect(transcript.map((m) => m.seq)).toEqual([0, 1]);
    expect(transcript.map((m) => m.content).sort()).toEqual(['one', 'two']);
  });

  it('a seq conflict that never clears surfaces as an error rather than retrying forever', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const id = await aConversation(athleteId, 'coach_chat', '2026-07-01');
    // Every insert into the transcript collides, as if other writers kept
    // winning the race.
    const conflict = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    const realInsert = testDb.db.insert.bind(testDb.db);
    vi.spyOn(testDb.db, 'insert').mockImplementation(((table: unknown) =>
      table === messages
        ? { values: () => ({ returning: () => Promise.reject(conflict) }) }
        : realInsert(table as typeof messages)) as typeof testDb.db.insert);

    await expect(appendMessages(athleteId, id, [{ role: 'athlete', content: 'x' }])).rejects.toBe(conflict);
  });

  it('an error that is not a seq conflict is thrown at once, with nothing written', async () => {
    const athleteId = await seedAthlete(testDb.db, 'a');
    const id = await aConversation(athleteId, 'coach_chat', '2026-07-01');

    await expect(
      appendMessages(athleteId, id, [{ role: 'robot' as 'athlete', content: 'x' }]),
    ).rejects.toThrow();
    expect(await transcriptOf(id)).toEqual([]);
  });
});

// ── Coach Briefing persistence (slice 13) ─────────────────────────────────────

describe('briefings — owned by a coach, about an athlete', () => {
  it('createBriefing stores a coach_briefing the coach owns, about the athlete', async () => {
    const coachId = await aCoach('lars');
    const athleteId = await seedAthlete(testDb.db, 'a');

    const conv = await createBriefing({ coachId, athleteId });

    expect(conv).toMatchObject({ coachId, athleteId, kind: 'coach_briefing' });
    expect((await getOwnedBriefing(coachId, conv.id))?.id).toBe(conv.id);
  });

  it('getOwnedBriefing resolves only for its coach, and never an athlete’s own conversation', async () => {
    const lars = await aCoach('lars');
    const sarah = await aCoach('sarah');
    const athleteId = await seedAthlete(testDb.db, 'a');
    const briefing = await createBriefing({ coachId: lars, athleteId });
    const chat = await aConversation(athleteId, 'coach_chat', '2026-07-01');

    expect(await getOwnedBriefing(sarah, briefing.id)).toBeNull();
    expect(await getOwnedBriefing(lars, chat)).toBeNull();
    expect(await getOwnedBriefing(lars, MISSING)).toBeNull();
  });

  it('a conversation of another kind is not a briefing even when it carries the coach', async () => {
    // Belt-and-suspenders: the kind is in the query and in coachOwnedOrNull.
    const lars = await aCoach('lars');
    const athleteId = await seedAthlete(testDb.db, 'a');
    const [row] = await testDb.db
      .insert(conversations)
      .values({ athleteId, coachId: lars, kind: 'coach_chat' })
      .returning({ id: conversations.id });

    expect(await getOwnedBriefing(lars, row.id)).toBeNull();
  });

  it('appendBriefingMessages writes for the owning coach and refuses anyone else', async () => {
    const lars = await aCoach('lars');
    const sarah = await aCoach('sarah');
    const briefing = await createBriefing({ coachId: lars, athleteId: await seedAthlete(testDb.db, 'a') });

    expect(await appendBriefingMessages(sarah, briefing.id, [{ role: 'head_coach', content: 'brief me' }])).toBeNull();
    const written = await appendBriefingMessages(lars, briefing.id, [
      { role: 'head_coach', content: 'how has her sleep trended?' },
    ]);

    expect(written?.map((m) => ({ role: m.role, seq: m.seq }))).toEqual([{ role: 'head_coach', seq: 0 }]);
    expect(await transcriptOf(briefing.id)).toEqual([
      { role: 'head_coach', content: 'how has her sleep trended?', seq: 0 },
    ]);
  });

  it('the latest briefing is the coach’s newest about that athlete, with its transcript', async () => {
    const lars = await aCoach('lars');
    const sarah = await aCoach('sarah');
    const athleteId = await seedAthlete(testDb.db, 'a');
    const otherAthlete = await seedAthlete(testDb.db, 'b');
    const insertBriefing = async (coachId: string, about: string, createdAt: string) => {
      const [row] = await testDb.db
        .insert(conversations)
        .values({ athleteId: about, coachId, kind: 'coach_briefing', createdAt: new Date(createdAt) })
        .returning({ id: conversations.id });
      return row.id;
    };
    await insertBriefing(lars, athleteId, '2026-07-01');
    const latest = await insertBriefing(lars, athleteId, '2026-07-02');
    await insertBriefing(lars, otherAthlete, '2026-07-03');
    await insertBriefing(sarah, athleteId, '2026-07-04');
    await appendBriefingMessages(lars, latest, [{ role: 'head_coach', content: 'and now?' }]);

    const read = await getLatestBriefingWithMessages(lars, athleteId);

    expect(read?.conversation.id).toBe(latest);
    expect(read?.messages.map((m) => m.content)).toEqual(['and now?']);
  });

  it('there is no latest briefing when the coach has none about that athlete', async () => {
    const lars = await aCoach('lars');
    const athleteId = await seedAthlete(testDb.db, 'a');
    await aConversation(athleteId, 'coach_chat', '2026-07-01');

    expect(await getLatestBriefingWithMessages(lars, athleteId)).toBeNull();
  });
});
