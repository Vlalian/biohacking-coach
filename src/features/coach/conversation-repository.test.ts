import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { conversations } from '@/db/schema';
import type { ConversationRow, MessageRow } from '@/db/schema';

// Spy the query builders so the ownership-scoping rule can be asserted directly:
// a conversation read must key on BOTH the id and the owning athlete_id.
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: vi.fn(actual.eq),
    and: vi.fn(actual.and),
    asc: vi.fn(actual.asc),
    desc: vi.fn(actual.desc),
  };
});

// A tiny fake of the drizzle builder chain. Each select resolves to `selectRows`,
// each insert returns `insertRows`; the last insert's `.values(...)` argument is
// captured so seq assignment can be asserted.
let selectRows: unknown[] = [];
let insertRows: unknown[] = [];
let insertedValues: unknown = null;

const limit = vi.fn(() => Promise.resolve(selectRows));
const orderBy = vi.fn(() => ({ limit }));
const where = vi.fn(() => ({ orderBy, limit }));
const from = vi.fn(() => ({ where }));
const select = vi.fn(() => ({ from }));

const returning = vi.fn(() => Promise.resolve(insertRows));
const values = vi.fn((v: unknown) => {
  insertedValues = v;
  return { returning };
});
const insert = vi.fn(() => ({ values }));

vi.mock('@/db', () => ({ getDb: () => ({ select, insert }) }));

const {
  getOwnedConversation,
  appendMessages,
  createConversation,
} = await import('./conversation-repository');

function cRow(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: 'c1',
    athleteId: 'athlete_1',
    kind: 'weekly_session',
    coachId: null,
    weeklySessionNumber: 1,
    createdAt: new Date(),
    endedAt: null,
    ...overrides,
  };
}

function mRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'm1',
    conversationId: 'c1',
    role: 'athlete',
    content: 'hi',
    seq: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  selectRows = [];
  insertRows = [];
  insertedValues = null;
  vi.clearAllMocks();
});

describe('createConversation', () => {
  it('inserts with the given athlete, kind and session number', async () => {
    insertRows = [cRow({ weeklySessionNumber: 3 })];
    const conv = await createConversation({
      athleteId: 'athlete_1',
      kind: 'weekly_session',
      weeklySessionNumber: 3,
    });
    expect(insert).toHaveBeenCalledWith(conversations);
    expect(insertedValues).toMatchObject({
      athleteId: 'athlete_1',
      kind: 'weekly_session',
      weeklySessionNumber: 3,
    });
    expect(conv.weeklySessionNumber).toBe(3);
  });
});

describe('getOwnedConversation', () => {
  it('scopes the read to both the id and the owning athlete', async () => {
    selectRows = [cRow()];
    await getOwnedConversation('athlete_1', 'c1');
    expect(eq).toHaveBeenCalledWith(conversations.id, 'c1');
    expect(eq).toHaveBeenCalledWith(conversations.athleteId, 'athlete_1');
  });

  it('returns null when no row matches (another athlete asks)', async () => {
    selectRows = [];
    expect(await getOwnedConversation('athlete_2', 'c1')).toBeNull();
  });
});

describe('appendMessages — ownership and seq', () => {
  it('refuses and writes nothing when the conversation is not owned', async () => {
    selectRows = []; // ownership lookup finds nothing
    const result = await appendMessages('athlete_2', 'c1', [
      { role: 'athlete', content: 'let me in' },
    ]);
    expect(result).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it('assigns consecutive seq numbers continuing past the highest existing', async () => {
    // First select = ownership row; second select = highest existing seq.
    const owner = cRow();
    let call = 0;
    limit.mockImplementation(() => {
      call += 1;
      return Promise.resolve(call === 1 ? [owner] : [mRow({ seq: 4 })]);
    });
    insertRows = [mRow({ seq: 5 }), mRow({ id: 'm2', role: 'coach_ai', seq: 6 })];

    const result = await appendMessages('athlete_1', 'c1', [
      { role: 'athlete', content: 'ping' },
      { role: 'coach_ai', content: 'pong' },
    ]);

    expect(result).toHaveLength(2);
    expect(insertedValues).toEqual([
      { conversationId: 'c1', role: 'athlete', content: 'ping', seq: 5 },
      { conversationId: 'c1', role: 'coach_ai', content: 'pong', seq: 6 },
    ]);
  });

  it('starts at seq 0 for the first message in a conversation', async () => {
    const owner = cRow();
    let call = 0;
    limit.mockImplementation(() => {
      call += 1;
      return Promise.resolve(call === 1 ? [owner] : []);
    });
    insertRows = [mRow({ seq: 0 })];

    await appendMessages('athlete_1', 'c1', [{ role: 'athlete', content: 'first' }]);

    expect(insertedValues).toEqual([
      { conversationId: 'c1', role: 'athlete', content: 'first', seq: 0 },
    ]);
  });
});
