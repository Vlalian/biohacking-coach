import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NarratableEvent } from './narration';

const getPendingNarrationEvents = vi.fn<(a: string) => Promise<NarratableEvent[]>>();
const claimAndNarrate = vi.fn();
const getLatestOpenConversation = vi.fn();
const createConversation = vi.fn();

vi.mock('./narration-repository', () => ({
  getPendingNarrationEvents,
  claimAndNarrate,
}));
vi.mock('./conversation-repository', () => ({
  getLatestOpenConversation,
  createConversation,
}));

const { narratePendingEvents } = await import('./narration-service');

const t = (key: string, values: Record<string, string | number> = {}) =>
  Object.keys(values).length ? `${key}(${Object.values(values).join('|')})` : key;
const weekday = (d: string) => `day:${d}`;

const event = (over: Partial<NarratableEvent> = {}): NarratableEvent => ({
  id: 'ev_1',
  actorId: 'coach_1',
  type: 'session_prescribed',
  payload: { sessionId: 's1', date: '2026-08-20', type: 'Endurance' },
  createdAt: new Date('2026-08-19T08:00:00Z'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getLatestOpenConversation.mockResolvedValue({ id: 'conv_1' });
  createConversation.mockResolvedValue({ id: 'conv_new' });
});

describe('narratePendingEvents — nothing pending', () => {
  it('writes nothing and touches no other repository', async () => {
    // This runs on every View render. The common case must cost one indexed
    // read and stop — not a name lookup, not a conversation lookup, and above
    // all not a write.
    getPendingNarrationEvents.mockResolvedValue([]);

    await narratePendingEvents('a1', t, weekday);

    expect(claimAndNarrate).not.toHaveBeenCalled();
    expect(createConversation).not.toHaveBeenCalled();
    expect(getLatestOpenConversation).not.toHaveBeenCalled();
  });
});

describe('narratePendingEvents — where the narration lands', () => {
  it('appends into the athlete\'s existing Coach Chat', async () => {
    getPendingNarrationEvents.mockResolvedValue([event()]);

    await narratePendingEvents('a1', t, weekday);

    expect(createConversation).not.toHaveBeenCalled();
    expect(claimAndNarrate).toHaveBeenCalledWith(
      expect.objectContaining({ athleteId: 'a1', conversationId: 'conv_1' }),
    );
  });

  it('creates a Coach Chat when the athlete has never opened one', async () => {
    // Coach Chat is created lazily on first use, so an athlete whose Head Coach
    // acted before they ever talked to the Coach has no conversation to append
    // to. Narration is a good enough reason to mint one — it is the Coach with
    // something to say.
    getPendingNarrationEvents.mockResolvedValue([event()]);
    getLatestOpenConversation.mockResolvedValue(null);

    await narratePendingEvents('a1', t, weekday);

    expect(createConversation).toHaveBeenCalledWith({
      athleteId: 'a1',
      kind: 'coach_chat',
    });
    expect(claimAndNarrate).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv_new' }),
    );
  });
});

describe('narratePendingEvents — what it claims', () => {
  it('claims exactly the events it narrated, so none narrates twice', async () => {
    getPendingNarrationEvents.mockResolvedValue([
      event(),
      event({ id: 'ev_2', actorId: 'coach_2' }),
    ]);

    await narratePendingEvents('a1', t, weekday);

    expect(claimAndNarrate).toHaveBeenCalledWith(
      expect.objectContaining({ eventIds: ['ev_1', 'ev_2'] }),
    );
  });

  it('never resolves a real name — no first or last name may reach the Coach', async () => {
    // Mads's rule, 2026-08-21. Narration is stored in the Coach Chat transcript,
    // and `toApiMessages` replays that transcript to Anthropic on every later
    // turn — so a name written here would reach the model for the rest of the
    // athlete's history, not once. Attribution stays neutral until a *preferred
    // name* (a self-chosen handle, not identity) exists; that is not built.
    getPendingNarrationEvents.mockResolvedValue([
      event(),
      event({ id: 'ev_2', actorId: 'coach_2' }),
    ]);

    await narratePendingEvents('a1', t, weekday);

    const written = claimAndNarrate.mock.calls[0][0].content as string;
    expect(written).toContain('yourHeadCoach');
    expect(written).not.toContain('Lars');
  });

  it('reads no identity table at all on this path', async () => {
    // Structural, not incidental: if someone later imports a name resolver here,
    // this is the assertion that should make them stop and think rather than a
    // name quietly appearing in every athlete's transcript.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/features/coach/narration-service.ts', 'utf8'),
    );
    expect(source).not.toContain('user.name');
    expect(source).not.toContain('FirstNames');
    expect(source).not.toContain('getAthleteName');
  });

  it('makes no Anthropic call — narration is composed, never generated', async () => {
    // The guarantee is structural: this module imports no coach client. If that
    // ever changes, this assertion is the thing that should be revisited
    // deliberately rather than a prompt quietly appearing on the render path.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/features/coach/narration-service.ts', 'utf8'),
    );
    expect(source).not.toContain('coach-client');
    expect(source).not.toContain('callCoach');
  });
});
