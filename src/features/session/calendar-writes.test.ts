import { describe, it, expect } from 'vitest';
import type { Session } from './session';
import type { SessionConflict } from './conflict';
import {
  NO_WRITES,
  shownSessions,
  beginMove,
  beginCreate,
  beginEdit,
  beginDelete,
  beginAdd,
  settle,
  inFlightIds,
} from './calendar-writes';

/**
 * The calendar's own writes, shown before the server answers and kept until
 * the page's props catch up (showable-version/44). What the calendar renders is
 * always `shownSessions(props, writes)` — derived, never a copy of the props —
 * so a refresh that lands mid-write cannot undo the write.
 */
function s(id: string, date: string, over: Partial<Session> = {}): Session {
  return {
    id,
    date,
    type: 'Endurance',
    status: 'planned',
    parked: false,
    dayOrder: 0,
    title: null,
    duration: 60,
    zone: null,
    note: null,
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    origin: 'athlete',
    isTraining: true,
    version: 1,
    ...over,
  };
}

const find = (list: Session[], id: string) => list.find((x) => x.id === id);

describe('a move', () => {
  it('moves the session to the drop day at once, keeping everything else', () => {
    const props = [s('a', '2026-09-22'), s('b', '2026-09-23')];
    const writes = beginMove(NO_WRITES, props, 'a', '2026-09-24');

    const shown = shownSessions(props, writes);
    expect(find(shown, 'a')!.date).toBe('2026-09-24');
    expect(find(shown, 'b')!.date).toBe('2026-09-23');
  });
});

describe('a move the server accepts', () => {
  const props = [s('a', '2026-09-22', { version: 3 })];
  const moved = beginMove(NO_WRITES, props, 'a', '2026-09-24');

  it('takes the server version, so the next write from this chip is not refused as stale', () => {
    const writes = settle(moved, 'a', { ok: true, version: 4 });

    expect(find(shownSessions(props, writes), 'a')).toMatchObject({ date: '2026-09-24', version: 4 });
  });

  it('is not undone by props read before it landed', () => {
    const writes = settle(moved, 'a', { ok: true, version: 4 });
    const stale = [s('a', '2026-09-22', { version: 3 })];

    expect(find(shownSessions(stale, writes), 'a')!.date).toBe('2026-09-24');
  });

  it('yields to props that carry its version or a newer one', () => {
    const writes = settle(moved, 'a', { ok: true, version: 4 });
    const caughtUp = [s('a', '2026-09-24', { version: 4, status: 'completed' })];
    const newer = [s('a', '2026-09-25', { version: 5 })];

    expect(find(shownSessions(caughtUp, writes), 'a')!.status).toBe('completed');
    expect(find(shownSessions(newer, writes), 'a')!.date).toBe('2026-09-25');
  });

  it('is no longer in flight', () => {
    expect(inFlightIds(moved)).toEqual(['a']);
    expect(inFlightIds(settle(moved, 'a', { ok: true, version: 4 }))).toEqual([]);
  });
});

describe('a move the server refuses', () => {
  const props = [s('a', '2026-09-22', { version: 3 })];
  const moved = beginMove(NO_WRITES, props, 'a', '2026-09-24');
  const conflict = (current: Session | null): SessionConflict => ({
    sessionId: 'a',
    intent: 'edit',
    baseVersion: 3,
    current,
    divergences: [],
  });

  it('puts the session back where it was', () => {
    const writes = settle(moved, 'a', { ok: false });

    expect(find(shownSessions(props, writes), 'a')!.date).toBe('2026-09-22');
    expect(inFlightIds(writes)).toEqual([]);
  });

  it('adopts the winner of a conflict, not the old row', () => {
    const winner = s('a', '2026-09-25', { version: 5 });
    const writes = settle(moved, 'a', { ok: false, conflict: conflict(winner) });

    expect(find(shownSessions(props, writes), 'a')).toEqual(winner);
  });

  it('removes the session when the winner deleted it', () => {
    const writes = settle(moved, 'a', { ok: false, conflict: conflict(null) });

    expect(find(shownSessions(props, writes), 'a')).toBeUndefined();
  });
});

describe('a create', () => {
  const TODAY = '2026-09-23';
  const draft = { date: '2026-09-24', type: 'Strength', duration: 45, isTraining: true, note: null };
  const props = [s('a', '2026-09-24', { dayOrder: 0 }), s('b', '2026-09-24', { dayOrder: 1 })];

  it('appears at once, after the day’s other sessions, as the athlete’s own', () => {
    const writes = beginCreate(NO_WRITES, props, 'tmp:1', draft, TODAY);

    expect(find(shownSessions(props, writes), 'tmp:1')).toMatchObject({
      date: '2026-09-24',
      type: 'Strength',
      duration: 45,
      origin: 'athlete',
      dayOrder: 2,
      status: 'planned',
      parked: false,
    });
    expect(inFlightIds(writes)).toEqual(['tmp:1']);
  });

  it('appears completed on or before today, planned after it — the server’s rule', () => {
    const past = beginCreate(NO_WRITES, [], 'tmp:1', { ...draft, date: TODAY }, TODAY);
    const future = beginCreate(NO_WRITES, [], 'tmp:2', { ...draft, date: '2026-09-24' }, TODAY);

    expect(shownSessions([], past)[0].status).toBe('completed');
    expect(shownSessions([], future)[0].status).toBe('planned');
  });

  it('is the first of its day when the day is empty', () => {
    const writes = beginCreate(NO_WRITES, props, 'tmp:1', { ...draft, date: '2026-09-26' }, TODAY);

    expect(find(shownSessions(props, writes), 'tmp:1')!.dayOrder).toBe(0);
  });

  it('is replaced by the server’s row, and stays while the props predate it', () => {
    const written = s('new_1', '2026-09-24', { dayOrder: 2, type: 'Strength' });
    const writes = settle(beginCreate(NO_WRITES, props, 'tmp:1', draft, TODAY), 'tmp:1', {
      ok: true,
      session: written,
    });

    const shown = shownSessions(props, writes);
    expect(find(shown, 'tmp:1')).toBeUndefined();
    expect(find(shown, 'new_1')).toEqual(written);
    expect(inFlightIds(writes)).toEqual([]);
  });

  it('shows once, not twice, when the props catch up', () => {
    const written = s('new_1', '2026-09-24', { dayOrder: 2 });
    const writes = settle(beginCreate(NO_WRITES, props, 'tmp:1', draft, TODAY), 'tmp:1', {
      ok: true,
      session: written,
    });

    expect(shownSessions([...props, written], writes).filter((x) => x.id === 'new_1')).toHaveLength(1);
  });

  it('disappears when the server refuses it', () => {
    const writes = settle(beginCreate(NO_WRITES, props, 'tmp:1', draft, TODAY), 'tmp:1', { ok: false });

    expect(shownSessions(props, writes)).toEqual(props);
  });
});

describe('an edit', () => {
  const props = [s('a', '2026-09-24', { version: 2, note: 'old' })];

  it('shows at once and takes the server version', () => {
    const editing = beginEdit(NO_WRITES, props, 'a', { note: 'new', duration: 30 });
    expect(find(shownSessions(props, editing), 'a')).toMatchObject({ note: 'new', duration: 30, version: 2 });

    const writes = settle(editing, 'a', { ok: true, version: 3 });
    expect(find(shownSessions(props, writes), 'a')).toMatchObject({ note: 'new', version: 3 });
  });

  it('goes back when refused', () => {
    const writes = settle(beginEdit(NO_WRITES, props, 'a', { note: 'new' }), 'a', { ok: false });

    expect(find(shownSessions(props, writes), 'a')!.note).toBe('old');
  });
});

describe('a delete', () => {
  const props = [s('a', '2026-09-24'), s('b', '2026-09-25')];

  it('removes the session at once', () => {
    const writes = beginDelete(NO_WRITES, 'a');

    expect(shownSessions(props, writes).map((x) => x.id)).toEqual(['b']);
    expect(inFlightIds(writes)).toEqual(['a']);
  });

  it('stays gone once the server accepts it, even under props read before it', () => {
    const writes = settle(beginDelete(NO_WRITES, 'a'), 'a', { ok: true });

    expect(shownSessions(props, writes).map((x) => x.id)).toEqual(['b']);
  });

  it('comes back when refused', () => {
    const writes = settle(beginDelete(NO_WRITES, 'a'), 'a', { ok: false });

    expect(shownSessions(props, writes)).toEqual(props);
  });
});

describe('writes on something that is not there', () => {
  it('a move or an edit of an unknown session changes nothing', () => {
    expect(beginMove(NO_WRITES, [], 'x', '2026-09-24')).toBe(NO_WRITES);
    expect(beginEdit(NO_WRITES, [], 'x', { note: 'n' })).toBe(NO_WRITES);
  });

  it('settling a key with nothing in flight changes nothing shown', () => {
    const props = [s('a', '2026-09-24')];
    expect(shownSessions(props, settle(NO_WRITES, 'a', { ok: true, version: 9 }))).toEqual(props);
  });
});

describe('an accepted edit that reports no version', () => {
  it('falls back to the props rather than vanishing', () => {
    const props = [s('a', '2026-09-24', { note: 'old' })];
    const writes = settle(beginEdit(NO_WRITES, props, 'a', { note: 'new' }), 'a', { ok: true });

    expect(shownSessions(props, writes)).toEqual(props);
  });
});

describe('the order the calendar shows', () => {
  it('is the server’s: by day, then by the order within the day', () => {
    const props = [
      s('mon', '2026-09-21', { dayOrder: 0 }),
      s('tue1', '2026-09-22', { dayOrder: 0 }),
      s('tue2', '2026-09-22', { dayOrder: 1 }),
    ];
    // Moved into Tuesday with the higher order it already held: it lands after tue1.
    const moved = beginMove(NO_WRITES, props, 'mon', '2026-09-22');
    const writes = beginEdit(moved, props, 'tue1', { dayOrder: 2 });

    expect(shownSessions(props, writes).map((x) => x.id)).toEqual(['mon', 'tue2', 'tue1']);
  });

  it('puts a created session on an earlier day before the later days', () => {
    const props = [s('wed', '2026-09-23')];
    const writes = beginCreate(
      NO_WRITES,
      props,
      'tmp:1',
      { date: '2026-09-21', type: 'Strength', duration: 30, isTraining: true, note: null },
      '2026-09-20',
    );

    expect(shownSessions(props, writes).map((x) => x.id)).toEqual(['tmp:1', 'wed']);
  });
});

describe('several writes at once', () => {
  const draft = { date: '2026-09-24', type: 'Strength', duration: 45, isTraining: true, note: null };

  it('one create landing leaves the other still showing', () => {
    const both = beginCreate(beginCreate(NO_WRITES, [], 'tmp:1', draft, '2026-09-20'), [], 'tmp:2', draft, '2026-09-20');
    const writes = settle(both, 'tmp:1', { ok: true, session: s('new_1', '2026-09-24') });

    expect(shownSessions([], writes).map((x) => x.id).sort()).toEqual(['new_1', 'tmp:2']);
  });

  it('edits and moves the session named, not the first one in the list', () => {
    const props = [s('a', '2026-09-22'), s('b', '2026-09-23')];
    const writes = beginMove(NO_WRITES, props, 'b', '2026-09-24');

    expect(shownSessions(props, writes).map((x) => [x.id, x.date])).toEqual([
      ['a', '2026-09-22'],
      ['b', '2026-09-24'],
    ]);
  });
});

describe('a second write to a session that is still saving', () => {
  // Review finding (showable-version/44): a move in flight, then a delete from
  // the drawer on the same chip, shared one slot, and the move's answer was
  // recorded as the delete's. One write per session at a time.
  const props = [s('a', '2026-09-22', { version: 3 })];
  const moving = beginMove(NO_WRITES, props, 'a', '2026-09-24');

  it('is not started: a delete, an edit or a move leaves the first write as it was', () => {
    expect(beginDelete(moving, 'a')).toBe(moving);
    expect(beginEdit(moving, props, 'a', { note: 'x' })).toBe(moving);
    expect(beginMove(moving, props, 'a', '2026-09-25')).toBe(moving);
  });

  it('so the first write settles as itself', () => {
    const writes = settle(beginDelete(moving, 'a'), 'a', { ok: true, version: 4 });

    expect(find(shownSessions(props, writes), 'a')).toMatchObject({ date: '2026-09-24', version: 4 });
  });
});

describe('an add built elsewhere — the Head Coach’s prescription', () => {
  it('appears at once under its key, and gives way to the server’s row', () => {
    const placeholder = s('tmp:1', '2026-09-24', { origin: 'head_coach', version: 0 });
    const adding = beginAdd(NO_WRITES, placeholder);
    expect(shownSessions([], adding)).toEqual([placeholder]);
    expect(inFlightIds(adding)).toEqual(['tmp:1']);

    const written = s('p_1', '2026-09-24', { origin: 'head_coach' });
    expect(shownSessions([], settle(adding, 'tmp:1', { ok: true, session: written }))).toEqual([written]);
  });

  it('disappears when refused', () => {
    const adding = beginAdd(NO_WRITES, s('tmp:1', '2026-09-24'));

    expect(shownSessions([], settle(adding, 'tmp:1', { ok: false }))).toEqual([]);
  });
});
