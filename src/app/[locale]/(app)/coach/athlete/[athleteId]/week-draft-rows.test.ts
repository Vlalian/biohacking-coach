import { describe, it, expect } from 'vitest';
import type { ProposedSession } from '@/features/coach/weekly-session';
import type { HowTo } from '@/features/session/how-to';
import {
  addedRow,
  focusText,
  howToOfRow,
  rowsOf,
  segmentMinutes,
  startEditing,
  toSessions,
  withFocusText,
  withSegment,
} from './week-draft-rows';

/**
 * The Head Coach's review rows (`training-architecture/17`, `/26`): a draft in,
 * the approval's payload out, and the how-to the coach reads and edits.
 */
const DRAFTED: ProposedSession[] = [
  { date: '2026-09-22', type: 'Endurance', durationMinutes: 90, zone: 'Z2', note: 'easy', sport: 'bike', cue: 'Spin light.' },
  { date: '2026-09-24', type: 'Intensity', durationMinutes: 60, zone: 'Z4', note: null, sport: 'run', sportReason: 'knee' },
  { date: '2026-09-27', type: 'Endurance', durationMinutes: null, zone: null, note: null },
];

const COACH: HowTo = {
  segments: [
    { name: 'warmUp', minutes: 15, zone: 'Z2', detail: null },
    { name: 'main', minutes: 70, zone: 'Z2', detail: 'Hills' },
    { name: 'coolDown', minutes: 5, zone: 'Z1', detail: null },
  ],
  focus: ['Seated'],
};

describe('rowsOf and toSessions', () => {
  it('sends an untouched draft back exactly as it came, with no field it did not have', () => {
    expect(toSessions(rowsOf(DRAFTED))).toEqual(DRAFTED);
  });

  it('keys rows by position and shows empty fields as empty text', () => {
    const rows = rowsOf(DRAFTED);
    expect(rows.map((r) => r.key)).toEqual([0, 1, 2]);
    expect(rows[2]).toMatchObject({ durationMinutes: '', zone: '', note: '', sport: null, sportReason: null, cue: null, coachHowTo: null });
  });

  it('carries the coach’s own how-to, and reads blank fields back as null', () => {
    const [row] = rowsOf([{ ...DRAFTED[0], coachHowTo: COACH }]);
    expect(toSessions([{ ...row, zone: '  ', note: ' ', durationMinutes: ' ' }])[0]).toMatchObject({
      durationMinutes: null,
      zone: null,
      note: null,
      coachHowTo: COACH,
    });
  });

  it('adds a row with nothing but a day and a type', () => {
    expect(toSessions([addedRow(7, '2026-09-21', 'Endurance')])).toEqual([
      { date: '2026-09-21', type: 'Endurance', durationMinutes: null, zone: null, note: null },
    ]);
  });
});

describe('howToOfRow', () => {
  it('fits the template to the row as the coach has left it, with Momentum’s cue beside it', () => {
    const [row] = rowsOf(DRAFTED);
    const view = howToOfRow({ ...row, durationMinutes: '60' }, 'en')!;
    expect(view.segments.reduce((t, x) => t + x.minutes, 0)).toBe(60);
    expect(view.cue).toBe('Spin light.');
    expect(view.byCoach).toBe(false);
  });

  it('shows the coach’s own how-to as final once they wrote one', () => {
    const [row] = rowsOf([{ ...DRAFTED[0], coachHowTo: COACH }]);
    expect(howToOfRow(row, 'da')).toEqual({ ...COACH, cue: null, byCoach: true });
  });

  it('shows none for a row with no minutes, and takes an empty zone as none', () => {
    const rows = rowsOf(DRAFTED);
    expect(howToOfRow(rows[2], 'en')).toBeNull();
    const zoneless = howToOfRow({ ...rows[1], zone: '' }, 'en')!;
    expect(zoneless.segments.find((x) => x.name === 'main')!.zone).toBe('Z4');
  });
});

describe('editing the how-to', () => {
  it('starts from the fitted template with Momentum’s cue as the last focus line', () => {
    const [bike, run, empty] = rowsOf(DRAFTED);
    const start = startEditing(bike, 'en')!;
    expect(start.focus.at(-1)).toBe('Spin light.');
    expect(start.segments).toEqual(howToOfRow(bike, 'en')!.segments);
    expect(startEditing(run, 'en')!.focus).toEqual(howToOfRow(run, 'en')!.focus);
    expect(startEditing(empty, 'en')).toBeNull();
    expect(startEditing({ ...run, zone: '' }, 'en')!.segments.find((x) => x.name === 'main')!.zone).toBe('Z4');
  });

  it('changes one segment’s minutes, zone or detail, and no other', () => {
    const minutes = withSegment(COACH, 1, 'minutes', '65');
    expect(minutes.segments.map((x) => x.minutes)).toEqual([15, 65, 5]);
    expect(segmentMinutes(minutes)).toBe(85);
    expect(withSegment(COACH, 2, 'zone', 'Z2').segments[2].zone).toBe('Z2');
    expect(withSegment(COACH, 1, 'detail', 'Flat').segments[1].detail).toBe('Flat');
    expect(withSegment(COACH, 1, 'detail', '  ').segments[1].detail).toBeNull();
    expect(withSegment(COACH, 1, 'detail', 'Flat').segments[0]).toEqual(COACH.segments[0]);
  });

  it('reads the focus as one cue per line, keeping a line as it is typed', () => {
    expect(focusText({ ...COACH, focus: ['a', 'b'] })).toBe('a\nb');
    expect(withFocusText(COACH, 'a\n').focus).toEqual(['a', '']);
  });
});
