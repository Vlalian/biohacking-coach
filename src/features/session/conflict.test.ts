import { describe, it, expect } from 'vitest';
import { describeConflict, isRedundant } from './conflict';
import type { Session } from './session';

const session = (over: Partial<Session> = {}): Session => ({
  id: 'sess_1',
  date: '2026-07-16',
  type: 'Endurance',
  status: 'planned',
  parked: false,
  dayOrder: 0,
  title: null,
  duration: 60,
  zone: 'Zone 2',
  note: null,
  feedbackBody: null,
  feedbackMind: null,
  feedbackComment: null,
  origin: 'coach',
  isTraining: true,
  version: 4,
  ...over,
});

describe('describeConflict', () => {
  it('reports only the fields the writer was actually competing for', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      // The winner moved it and shortened it.
      current: session({ date: '2026-07-18', duration: 45 }),
      // This writer was only changing the note.
      attempted: { note: 'felt easy' },
      intent: 'edit',
    });

    expect(conflict.divergences).toEqual([
      { field: 'note', current: null, attempted: 'felt easy' },
    ]);
  });

  it('lists a field that both writers set differently', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: session({ date: '2026-07-18' }),
      attempted: { date: '2026-07-17' },
      intent: 'edit',
    });

    expect(conflict.divergences).toEqual([
      { field: 'date', current: '2026-07-18', attempted: '2026-07-17' },
    ]);
  });

  it('carries the base version and the winning row so the caller can show all three', () => {
    const current = session({ type: 'Threshold' });
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current,
      attempted: { type: 'Recovery' },
      intent: 'edit',
    });

    expect(conflict.baseVersion).toBe(3);
    expect(conflict.current).toBe(current);
    expect(conflict.sessionId).toBe('sess_1');
  });

  it('collapses a deleted row to one divergence instead of comparing against nothing', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: null,
      attempted: { type: 'Recovery', note: 'shorter' },
      intent: 'edit',
    });

    expect(conflict.current).toBeNull();
    expect(conflict.divergences).toEqual([{ field: 'deleted', current: null, attempted: null }]);
  });

  it('treats empty string and whitespace as absent, so blanking is not a false divergence', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: session({ note: '   ' }),
      attempted: { note: '' },
      intent: 'edit',
    });

    expect(conflict.divergences).toEqual([]);
  });

  it('does not report a field the writer set to what the winner already set', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: session({ type: 'Threshold' }),
      attempted: { type: 'Threshold' },
      intent: 'edit',
    });

    expect(conflict.divergences).toEqual([]);
  });

  it('compares numeric columns by their rendered value', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: session({ duration: 45 }),
      attempted: { duration: '45' },
      intent: 'edit',
    });

    expect(conflict.divergences).toEqual([]);
  });

  it('reports a disagreement about isTraining, which used to be invisible', () => {
    // The Athlete Session edit sets this field, so a writer can be competing
    // for it alone. Before it was compared, such a conflict reported no
    // divergence at all and read as "already done".
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: session({ isTraining: false }),
      attempted: { isTraining: 'true' },
      intent: 'edit',
    });

    expect(conflict.divergences).toEqual([
      { field: 'isTraining', current: 'false', attempted: 'true' },
    ]);
    expect(isRedundant(conflict)).toBe(false);
  });
});

describe('isRedundant', () => {
  it('is true when the winner already made every change this writer wanted', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: session({ type: 'Threshold' }),
      attempted: { type: 'Threshold' },
      intent: 'edit',
    });

    expect(isRedundant(conflict)).toBe(true);
  });

  it('is false when the row was deleted — that is never "already done"', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: null,
      attempted: {},
      intent: 'edit',
    });

    expect(isRedundant(conflict)).toBe(false);
  });

  // A refused DELETE, which the field comparison alone cannot judge. A delete
  // names no fields, so `divergences` is always empty — and the case below used
  // to be reported as redundant while the session was still sitting there.
  it('is false for a refused delete whose row is still present', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      // The winner edited the row rather than deleting it, so it survives.
      current: session({ type: 'Threshold' }),
      attempted: {},
      intent: 'delete',
    });

    expect(conflict.divergences).toEqual([]);
    expect(isRedundant(conflict)).toBe(false);
  });

  it('is true for a delete whose row someone else already removed', () => {
    // The other half, so the rule is "did the row go", not "always false".
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: null,
      attempted: {},
      intent: 'delete',
    });

    expect(isRedundant(conflict)).toBe(true);
  });

  it('is false when a real disagreement remains', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: session({ type: 'Threshold' }),
      attempted: { type: 'Recovery' },
      intent: 'edit',
    });

    expect(isRedundant(conflict)).toBe(false);
  });
});
