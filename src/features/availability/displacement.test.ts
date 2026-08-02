import { describe, it, expect } from 'vitest';
import {
  sessionsToPark,
  sessionsToRestore,
  canMarkUnavailable,
} from './displacement';

describe('sessionsToPark — what an Unavailable Date parks', () => {
  it('parks every planned training session on the day', () => {
    const ids = sessionsToPark([
      { id: 'a', isTraining: true, status: 'planned' },
      { id: 'b', isTraining: true, status: 'planned' },
    ]);
    expect(ids).toEqual(['a', 'b']);
  });

  it('never touches a completed session — the training record is immutable', () => {
    const ids = sessionsToPark([
      { id: 'done', isTraining: true, status: 'completed' },
      { id: 'todo', isTraining: true, status: 'planned' },
    ]);
    expect(ids).toEqual(['todo']);
  });

  it('leaves non-training sessions in place — they coexist with unavailability', () => {
    const ids = sessionsToPark([
      { id: 'mobility', isTraining: false, status: 'planned' },
      { id: 'ride', isTraining: true, status: 'planned' },
    ]);
    expect(ids).toEqual(['ride']);
  });

  it('leaves a skipped session — it is a resolved record, not still-to-happen', () => {
    // Parking then restoring would rewrite the skip to 'planned' and lose what
    // the athlete recorded (ADR 0002). Only planned sessions are displaced.
    const ids = sessionsToPark([
      { id: 'skip', isTraining: true, status: 'skipped' },
      { id: 'plan', isTraining: true, status: 'planned' },
    ]);
    expect(ids).toEqual(['plan']);
  });

  it('parks nothing on an empty day', () => {
    expect(sessionsToPark([])).toEqual([]);
  });
});

describe('sessionsToRestore — what clearing an Unavailable Date undoes', () => {
  const TODAY = '2026-07-16';

  it("restores the day's parked sessions when the date is in the future", () => {
    const ids = sessionsToRestore(
      [
        { id: 'p', parked: true },
        { id: 'q', parked: true },
      ],
      '2026-07-18',
      TODAY,
    );
    expect(ids).toEqual(['p', 'q']);
  });

  it('restores on the current day', () => {
    const ids = sessionsToRestore([{ id: 'p', parked: true }], TODAY, TODAY);
    expect(ids).toEqual(['p']);
  });

  it('restores nothing on a past day — the unavailability is history (ADR 0002)', () => {
    const ids = sessionsToRestore(
      [{ id: 'p', parked: true }],
      '2026-07-14',
      TODAY,
    );
    expect(ids).toEqual([]);
  });

  it('restores nothing on a past day even earlier in the same week', () => {
    // today is Thursday; the cleared day is Tuesday of the same week — still past.
    const ids = sessionsToRestore(
      [{ id: 'p', parked: true }],
      '2026-07-14',
      '2026-07-16',
    );
    expect(ids).toEqual([]);
  });

  it('only touches parked sessions, never a live one', () => {
    const ids = sessionsToRestore(
      [
        { id: 'parked', parked: true },
        { id: 'live', parked: false },
      ],
      '2026-07-18',
      TODAY,
    );
    expect(ids).toEqual(['parked']);
  });
});

describe('canMarkUnavailable — the boundary for marking a date', () => {
  const TODAY = '2026-07-16';

  it('allows today and future days', () => {
    expect(canMarkUnavailable(TODAY, TODAY)).toBe(true);
    expect(canMarkUnavailable('2026-07-20', TODAY)).toBe(true);
  });

  it('refuses a past day — nothing is scheduled into the past', () => {
    expect(canMarkUnavailable('2026-07-15', TODAY)).toBe(false);
  });
});
