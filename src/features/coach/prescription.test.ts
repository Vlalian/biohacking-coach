import { describe, it, expect } from 'vitest';
import { prescribedSessionOf, prescriptionColumns } from './prescription';

/**
 * What a Head Coach's add or edit writes to a session's columns. One rule, read
 * by the server that writes it and by the calendar that shows the edit before
 * the server answers (showable-version/44), so the two cannot disagree.
 */
describe('prescriptionColumns', () => {
  it('writes what was given, with the type trimmed', () => {
    expect(
      prescriptionColumns({
        date: '2026-09-24',
        type: '  Tempo ',
        duration: 45,
        zone: 'Zone 3',
        title: 'Cruise intervals',
        note: '3 x 10 min',
        isTraining: false,
      }),
    ).toEqual({
      date: '2026-09-24',
      type: 'Tempo',
      duration: 45,
      zone: 'Zone 3',
      title: 'Cruise intervals',
      note: '3 x 10 min',
      isTraining: false,
    });
  });

  it('writes an empty column for each field left out, and counts the session as training', () => {
    expect(prescriptionColumns({ date: '2026-09-24', type: 'Tempo' })).toEqual({
      date: '2026-09-24',
      type: 'Tempo',
      duration: null,
      zone: null,
      title: null,
      note: null,
      isTraining: true,
    });
  });
});

describe('prescribedSessionOf', () => {
  it('is the session a prescription writes: planned, first in its day, the Head Coach’s', () => {
    expect(prescribedSessionOf('s1', { date: '2026-09-24', type: ' Tempo ', duration: 40 }, 1)).toEqual({
      id: 's1',
      date: '2026-09-24',
      type: 'Tempo',
      duration: 40,
      zone: null,
      title: null,
      note: null,
      isTraining: true,
      status: 'planned',
      parked: false,
      sport: null,
      dayOrder: 0,
      origin: 'head_coach',
      feedbackBody: null,
      feedbackMind: null,
      feedbackComment: null,
      version: 1,
    });
  });
});
