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
    });

    expect(conflict.divergences).toEqual([]);
  });

  it('does not report a field the writer set to what the winner already set', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: session({ type: 'Threshold' }),
      attempted: { type: 'Threshold' },
    });

    expect(conflict.divergences).toEqual([]);
  });

  it('compares numeric columns by their rendered value', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: session({ duration: 45 }),
      attempted: { duration: '45' },
    });

    expect(conflict.divergences).toEqual([]);
  });
});

describe('isRedundant', () => {
  it('is true when the winner already made every change this writer wanted', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: session({ type: 'Threshold' }),
      attempted: { type: 'Threshold' },
    });

    expect(isRedundant(conflict)).toBe(true);
  });

  it('is false when the row was deleted — that is never "already done"', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: null,
      attempted: {},
    });

    expect(isRedundant(conflict)).toBe(false);
  });

  it('is false when a real disagreement remains', () => {
    const conflict = describeConflict({
      sessionId: 'sess_1',
      baseVersion: 3,
      current: session({ type: 'Threshold' }),
      attempted: { type: 'Recovery' },
    });

    expect(isRedundant(conflict)).toBe(false);
  });
});
