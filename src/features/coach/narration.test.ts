import { describe, it, expect } from 'vitest';
import { composeNarration, type NarratableEvent } from './narration';

/**
 * A stub translator that renders `key(values)` rather than real copy.
 *
 * The composer's job is *which* clause, with *which* values — not what English
 * or Danish reads like. Asserting against rendered ICU strings would test the
 * message catalogue instead, and would go red every time the wording is
 * softened. This keeps the tests about the decision.
 */
const t = (key: string, values: Record<string, string | number> = {}) => {
  const rendered = Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return rendered ? `${key}(${rendered})` : key;
};

/** Weekdays are locale formatting; injected so the tests are deterministic. */
const weekday = (dateKey: string) => `day:${dateKey}`;

const NAMES = { coach_1: 'Lars', coach_2: 'Mette' };

const prescribed = (over: Record<string, unknown> = {}): NarratableEvent => ({
  id: 'ev_1',
  actorId: 'coach_1',
  type: 'session_prescribed',
  payload: { sessionId: 's1', date: '2026-08-20', type: 'Endurance', note: null },
  createdAt: new Date('2026-08-19T08:00:00Z'),
  ...over,
});

describe('composeNarration — one event', () => {
  it('names the Head Coach, the session type and the day', () => {
    const message = composeNarration([prescribed()], NAMES, t, weekday);

    expect(message).toBe(
      'Narration.single(clause=Narration.prescribed(coach=Lars,day=day:2026-08-20,type=Endurance))',
    );
  });

  it("carries the Head Coach's own note through as the reason", () => {
    const withNote = prescribed({
      payload: {
        sessionId: 's1',
        date: '2026-08-20',
        type: 'Endurance',
        note: 'we need the volume before the taper',
      },
    });

    const message = composeNarration([withNote], NAMES, t, weekday);

    expect(message).toContain('Narration.withReason(');
    expect(message).toContain('reason=we need the volume before the taper');
  });

  it('reads cleanly with no note — no empty reason clause', () => {
    const message = composeNarration([prescribed()], NAMES, t, weekday);
    expect(message).not.toContain('withReason');
  });

  it('never invents a reason the Head Coach did not give', () => {
    // A blank note is the same as no note. The whole point of sourcing the
    // reason from the payload is that the app cannot make one up.
    const blank = prescribed({
      payload: { sessionId: 's1', date: '2026-08-20', type: 'Endurance', note: '   ' },
    });
    expect(composeNarration([blank], NAMES, t, weekday)).not.toContain('withReason');
  });
});

describe('composeNarration — the other two verbs', () => {
  it('narrates an edit from the new content, and its note', () => {
    const edited: NarratableEvent = {
      id: 'ev_2',
      actorId: 'coach_1',
      type: 'session_edited',
      payload: {
        sessionId: 's1',
        from: { date: '2026-08-20' },
        to: { date: '2026-08-21', type: 'Tempo', note: 'move it off your long day' },
      },
      createdAt: new Date('2026-08-19T09:00:00Z'),
    };

    const message = composeNarration([edited], NAMES, t, weekday);

    expect(message).toContain('Narration.edited(');
    expect(message).toContain('day=day:2026-08-21');
    expect(message).toContain('type=Tempo');
    expect(message).toContain('reason=move it off your long day');
  });

  it('narrates a delete without naming a session type — the event does not record one', () => {
    // Verified against `head-coach-service.deletePrescribedSession`: the payload
    // is `{ sessionId, date, origin }`. There is no type to name, so the copy
    // must not claim one.
    const deleted: NarratableEvent = {
      id: 'ev_3',
      actorId: 'coach_1',
      type: 'session_deleted',
      payload: { sessionId: 's1', date: '2026-08-22', origin: 'head_coach' },
      createdAt: new Date('2026-08-19T10:00:00Z'),
    };

    const message = composeNarration([deleted], NAMES, t, weekday);

    expect(message).toBe(
      'Narration.single(clause=Narration.deletedNoType(coach=Lars,day=day:2026-08-22))',
    );
  });

  it('degrades to a plainer sentence on a malformed payload rather than throwing', () => {
    // This runs on app-open. A throw here would break every View for this
    // athlete — far worse than a vague sentence.
    const broken = prescribed({ payload: null });
    expect(() => composeNarration([broken], NAMES, t, weekday)).not.toThrow();
    expect(composeNarration([broken], NAMES, t, weekday)).toContain('NoType');
  });
});

describe('composeNarration — a batch', () => {
  it('renders several pending events as ONE message, a lead plus a list', () => {
    // The criterion is "not as N separate interruptions": a coach who plans an
    // athlete's block in one sitting produces several events at once, and one
    // Coach turn per event reads as a malfunction.
    const message = composeNarration(
      [
        prescribed(),
        prescribed({ id: 'ev_2', payload: { date: '2026-08-22', type: 'Tempo' } }),
      ],
      NAMES,
      t,
      weekday,
    );

    expect(message).not.toBeNull();
    const lines = message!.split('\n');
    expect(lines[0]).toBe('Narration.multiLead');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('type=Endurance');
    expect(lines[2]).toContain('type=Tempo');
  });

  it('attributes each event to the coach who acted, not to one name for the batch', () => {
    const message = composeNarration(
      [prescribed(), prescribed({ id: 'ev_2', actorId: 'coach_2' })],
      NAMES,
      t,
      weekday,
    );

    expect(message).toContain('coach=Lars');
    expect(message).toContain('coach=Mette');
  });

  it('falls back to a neutral label when the actor cannot be named', () => {
    const orphan = prescribed({ actorId: null });
    expect(composeNarration([orphan], NAMES, t, weekday)).toContain(
      'coach=Narration.yourHeadCoach',
    );
  });

  it('returns null for an empty list, so the caller has one thing to check', () => {
    expect(composeNarration([], NAMES, t, weekday)).toBeNull();
  });
});
