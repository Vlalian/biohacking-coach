import { describe, it, expect } from 'vitest';
import { composeNarration, type NarratableEvent } from './narration';
import en from '@/messages/en.json';

/**
 * A stub translator that renders `key(values)` rather than real copy — but
 * **refuses a key the catalogue does not have.**
 *
 * The composer's job is *which* clause, with *which* values — not what English
 * or Danish reads like. Asserting against rendered ICU strings would test the
 * message catalogue instead, and would go red every time the wording is
 * softened. So the rendering stays symbolic and the tests stay about the
 * decision.
 *
 * The key check is not decoration. Until 2026-08-21 this stub accepted any
 * string, and the composer was passing *absolute* keys (`Narration.single`) to
 * a translator the layout had already namespaced to `Narration` — so next-intl
 * resolved `Narration.Narration.single` and the athlete would have seen a raw
 * message key in the Coach thread. Every test here passed. A stub that accepts
 * anything tests nothing about the contract it stands in for, so this one holds
 * the composer to the same namespace the real caller gives it.
 */
const NARRATION = en.Narration as Record<string, string>;

const t = (key: string, values: Record<string, string | number> = {}) => {
  if (!(key in NARRATION)) {
    throw new Error(
      `no such message "Narration.${key}" — the translator is namespaced to ` +
        `"Narration", so keys must be relative to it`,
    );
  }
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
      'single(clause=prescribed(coach=Lars,day=day:2026-08-20,type=Endurance))',
    );
  });

  it("never carries the Head Coach's note — it is free text bound for the model", () => {
    // Mads, 2026-08-21. The note is the only honest source of a *reason*, and
    // dropping it costs warmth — but this sentence is stored in the Coach Chat
    // transcript, and `toApiMessages` replays that transcript to Anthropic on
    // every later turn. A coach writing a name into a note would put it in
    // front of the model for the rest of the athlete's history.
    // `assertNoDirectIdentifier` cannot catch that (email and phone shapes
    // only, never a name in prose), so the note is not sent rather than
    // filtered.
    const withNote = prescribed({
      payload: {
        sessionId: 's1',
        date: '2026-08-20',
        type: 'Endurance',
        // A third party's name, typed by a human into a free-text field —
        // deliberately not one of NAMES, which are the *attributed* coaches and
        // legitimately appear in the sentence.
        note: "ride with Bjorn on Saturday, he'll hold your pace",
      },
    });

    const message = composeNarration([withNote], NAMES, t, weekday);

    expect(message).not.toContain('Bjorn');
    expect(message).not.toContain('hold your pace');
    // Identical to the same event with no note at all: the note changes nothing.
    expect(message).toBe(composeNarration([prescribed()], NAMES, t, weekday));
  });
});

describe('composeNarration — the other two verbs', () => {
  it('narrates an edit from the new content, without its note', () => {
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

    expect(message).toContain('edited(');
    expect(message).toContain('day=day:2026-08-21');
    expect(message).toContain('type=Tempo');
    // The note rides in the same payload and is deliberately not read.
    expect(message).not.toContain('move it off your long day');
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
      'single(clause=deletedNoType(coach=Lars,day=day:2026-08-22))',
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

describe('composeNarration — a move', () => {
  // ADR 0003's 2026-08-21 amendment gave the Head Coach placement authority, and
  // it shipped unnarrated: the event was written and collected by nothing. A
  // coach rearranging someone's week without telling them is the exact case the
  // "no silent mutation" rule exists for.
  const moved = (over: Record<string, unknown> = {}): NarratableEvent => ({
    id: 'ev_4',
    actorId: 'coach_1',
    type: 'session_moved',
    // Verified against `session-move.applyMove`: `{ sessionId, from, to }`, both
    // days as bare date strings — NOT the nested objects an edit writes.
    payload: { sessionId: 's1', from: '2026-08-20', to: '2026-08-22' },
    createdAt: new Date('2026-08-19T11:00:00Z'),
    ...over,
  });

  it('names both days — a move means the pair, not the destination', () => {
    const message = composeNarration([moved()], NAMES, t, weekday);

    expect(message).toBe(
      'single(clause=moved(coach=Lars,day=day:2026-08-22,fromDay=day:2026-08-20))',
    );
  });

  it('names no session type, because the event does not record one', () => {
    // Same honesty rule as a delete: the payload has no type, so the copy must
    // not claim one rather than invent a plausible word.
    expect(composeNarration([moved()], NAMES, t, weekday)).not.toContain('type=');
  });

  it('falls back to a destination-only sentence when the origin day is missing', () => {
    // A move that lost its `from` is a different sentence, not a vaguer one —
    // "moved a session to Saturday" still says something true.
    const message = composeNarration([moved({ payload: { to: '2026-08-22' } })], NAMES, t, weekday);

    expect(message).toBe('single(clause=movedNoFrom(coach=Lars,day=day:2026-08-22))');
  });

  it('does not throw on a malformed payload', () => {
    expect(() =>
      composeNarration([moved({ payload: null })], NAMES, t, weekday),
    ).not.toThrow();
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
    expect(lines[0]).toBe('multiLead');
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
      'coach=yourHeadCoach',
    );
  });

  it('returns null for an empty list, so the caller has one thing to check', () => {
    expect(composeNarration([], NAMES, t, weekday)).toBeNull();
  });
});

describe('composeNarration — the Coach announcing its own blocks (training-architecture/07)', () => {
  const drafted = (payload: unknown): NarratableEvent => ({
    id: 'ev_b',
    actorId: null,
    type: 'blocks_drafted',
    payload,
    createdAt: new Date('2026-09-14T08:00:00Z'),
  });

  it('names the race and every block, and names no human — not even the fallback', () => {
    const out = composeNarration(
      [
        drafted({
          raceId: 'r1',
          raceName: 'Ironman Copenhagen',
          blocks: [
            { name: 'Build the Volume', endDate: '2027-01-10' },
            { name: 'Taper', endDate: '2027-08-15' },
          ],
        }),
      ],
      { coach_1: 'Lars' },
      t,
      weekday,
    );

    expect(out).toContain('blocksDrafted(');
    expect(out).toContain('race=Ironman Copenhagen');
    expect(out).toContain('Build the Volume');
    expect(out).toContain('Taper');
    expect(out).not.toContain('yourHeadCoach');
    expect(out).not.toContain('coach=');
    expect(out).not.toContain('Lars');
  });

  it('degrades a malformed payload to the sentence with no detail', () => {
    for (const payload of [null, {}, { raceName: 'X' }, { raceName: 'X', blocks: 'four' }]) {
      const out = composeNarration([drafted(payload)], {}, t, weekday);
      expect(out).toBe('single(clause=blocksDraftedNoDetail)');
    }
  });

  it('announces a drafted week in one sentence, naming no human, whatever the payload', () => {
    // `training-architecture/16`: the proposal itself is on the calendar, so the
    // sentence carries no session list — and a malformed payload says the same.
    for (const payload of [{ weekStart: '2026-09-21', sessions: [] }, null, {}]) {
      const out = composeNarration(
        [{ id: 'ev_w', actorId: null, type: 'week_drafted', payload, createdAt: new Date('2026-09-16T08:00:00Z') }],
        { coach_1: 'Lars' },
        t,
        weekday,
      );
      expect(out).toBe('single(clause=weekDrafted)');
      expect(out).not.toContain('yourHeadCoach');
      expect(out).not.toContain('Lars');
    }
  });

  it('renders the unrealistic flag with the race and the reason', () => {
    const out = composeNarration(
      [
        {
          id: 'ev_u',
          actorId: null,
          type: 'race_flagged_unrealistic',
          payload: { raceId: 'r1', raceName: 'Ironman Copenhagen', reason: 'eleven months is short' },
          createdAt: new Date('2026-09-14T08:00:00Z'),
        },
      ],
      {},
      t,
      weekday,
    );

    expect(out).toContain('raceUnrealistic(');
    expect(out).toContain('race=Ironman Copenhagen');
    expect(out).toContain('reason=eleven months is short');
    expect(out).not.toContain('yourHeadCoach');
  });
});

describe('composeNarration — malformed payloads degrade, never throw', () => {
  const at = new Date('2026-08-19T08:00:00Z');

  it('reads a whitespace-only or non-string field as absent', () => {
    const out = composeNarration(
      [{ id: 'e', actorId: null, type: 'session_prescribed', payload: { date: '  ', type: 7 }, createdAt: at }],
      {},
      t,
      weekday,
    );
    expect(out).toBe('single(clause=prescribedNoType(coach=yourHeadCoach,day=recently))');
  });

  it('trims a field before rendering it', () => {
    const out = composeNarration(
      [{ id: 'e', actorId: null, type: 'session_prescribed', payload: { date: '2026-08-20', type: ' Endurance ' }, createdAt: at }],
      {},
      t,
      weekday,
    );
    expect(out).toBe('single(clause=prescribed(coach=yourHeadCoach,day=day:2026-08-20,type=Endurance))');
  });

  it('survives a null payload, a primitive payload, and a null on the path', () => {
    for (const payload of [null, 'x', { to: null }, { to: { date: null } }]) {
      const out = composeNarration(
        [{ id: 'e', actorId: null, type: 'session_edited', payload, createdAt: at }],
        {},
        t,
        weekday,
      );
      expect(out).toBe('single(clause=editedNoType(coach=yourHeadCoach,day=recently))');
    }
  });

  it('falls back to the from-date when an edit carries no to-date', () => {
    const out = composeNarration(
      [{ id: 'e', actorId: null, type: 'session_edited', payload: { from: { date: '2026-08-20' } }, createdAt: at }],
      {},
      t,
      weekday,
    );
    expect(out).toContain('day=day:2026-08-20');
  });
});

describe('composeNarration — the Coach’s own clauses at their edges', () => {
  const at = new Date('2026-09-14T08:00:00Z');

  it('falls back to no detail on an empty block list or an unnamed block', () => {
    for (const blocks of [[], [{ name: 'A' }, {}], [{ endDate: '2027-01-01' }]]) {
      const out = composeNarration(
        [{ id: 'e', actorId: null, type: 'blocks_drafted', payload: { raceName: 'IM', blocks }, createdAt: at }],
        {},
        t,
        weekday,
      );
      expect(out).toBe('single(clause=blocksDraftedNoDetail)');
    }
  });

  it('joins the block names with a middle dot', () => {
    const out = composeNarration(
      [
        {
          id: 'e',
          actorId: null,
          type: 'blocks_drafted',
          payload: { raceName: 'IM', blocks: [{ name: 'Base' }, { name: 'Build' }, { name: 'Taper' }] },
          createdAt: at,
        },
      ],
      {},
      t,
      weekday,
    );
    expect(out).toBe('single(clause=blocksDrafted(race=IM,blocks=Base · Build · Taper))');
  });

  it('renders the unrealistic flag with fallbacks for a missing race name and reason', () => {
    const out = composeNarration(
      [{ id: 'e', actorId: null, type: 'race_flagged_unrealistic', payload: {}, createdAt: at }],
      {},
      t,
      weekday,
    );
    expect(out).toBe('single(clause=raceUnrealistic(race=yourRace,reason=noReason))');
  });
});

describe('composeNarration — a Head Coach edits a block (training-architecture/08)', () => {
  const at = new Date('2026-09-14T08:00:00Z');
  const edited = (from: { name: string; endDate: string }, to: { name: string; endDate: string }): NarratableEvent => ({
    id: 'ev_e',
    actorId: 'coach_1',
    type: 'block_edited',
    payload: { raceId: 'r1', position: 2, from, to },
    createdAt: at,
  });

  it('narrates a rename, attributed to the acting coach', () => {
    const out = composeNarration(
      [edited({ name: 'Sharpen the Bike', endDate: '2027-05-02' }, { name: 'Long Rides', endDate: '2027-05-02' })],
      { coach_1: 'Lars' },
      t,
      weekday,
    );
    expect(out).toBe('single(clause=blockRenamed(coach=Lars,from=Sharpen the Bike,to=Long Rides))');
  });

  it('narrates a moved end with the new date, falling back to "your Head Coach"', () => {
    const out = composeNarration(
      [edited({ name: 'Sharpen the Bike', endDate: '2027-05-02' }, { name: 'Sharpen the Bike', endDate: '2027-04-25' })],
      {},
      t,
      weekday,
    );
    expect(out).toBe('single(clause=blockRebounded(coach=yourHeadCoach,name=Sharpen the Bike,day=2027-04-25))');
  });

  it('narrates both when both changed', () => {
    const out = composeNarration(
      [edited({ name: 'Sharpen the Bike', endDate: '2027-05-02' }, { name: 'Long Rides', endDate: '2027-04-25' })],
      {},
      t,
      weekday,
    );
    expect(out).toBe(
      'single(clause=blockRenamedAndRebounded(coach=yourHeadCoach,from=Sharpen the Bike,to=Long Rides,day=2027-04-25))',
    );
  });

  it('degrades a malformed payload to the plain sentence', () => {
    const side = { name: 'A', endDate: '2027-01-01' };
    for (const payload of [
      null,
      {},
      { from: { name: 'A' }, to: side },
      { from: { endDate: '2027-01-01' }, to: side },
      { from: side, to: { name: 'A' } },
      { from: side, to: { endDate: '2027-01-01' } },
      { from: side, to: side },
    ]) {
      const out = composeNarration(
        [{ id: 'e', actorId: null, type: 'block_edited', payload, createdAt: at }],
        {},
        t,
        weekday,
      );
      expect(out).toBe('single(clause=blockEditedNoDetail(coach=yourHeadCoach))');
    }
  });
});

describe('composeNarration — the Head Coach’s hand on the drafted week and its day (training-architecture/17)', () => {
  const at = new Date('2026-09-16T08:00:00Z');
  const ev = (type: NarratableEvent['type'], payload: unknown): NarratableEvent => ({ id: 'ev', actorId: 'coach_1', type, payload, createdAt: at });

  it('narrates a moved planning day through the catalogue’s weekday key, attributed to the coach', () => {
    const out = composeNarration([ev('weekly_session_day_set', { from: 'Wednesday', to: 'Sunday' })], { coach_1: 'Lars' }, t, weekday);
    expect(out).toBe('single(clause=weeklyDaySet(coach=Lars,day=daySunday))');
  });

  it('degrades a day change with no readable day, and falls back to "your Head Coach"', () => {
    const out = composeNarration([{ ...ev('weekly_session_day_set', {}), actorId: null }], {}, t, weekday);
    expect(out).toBe('single(clause=weeklyDaySetNoDetail(coach=yourHeadCoach))');
  });

  it('narrates an approval that changed the week as the coach shaping it', () => {
    const out = composeNarration([ev('week_draft_approved', { changed: true, weekStart: '2026-09-21' })], { coach_1: 'Lars' }, t, weekday);
    expect(out).toBe('single(clause=weekDraftShaped(coach=Lars))');
  });
});
