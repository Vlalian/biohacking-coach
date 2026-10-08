import { describe, it, expect } from 'vitest';
import type { ProposedSession } from '@/features/coach/weekly-session';
import { howToOf } from '@/features/session/how-to';
import { racePhaseOf } from '@/features/session/race-phase';
import { howToOfRow, rowsOf, startEditing } from './week-draft-rows';

/**
 * `training-architecture/55`: the Head Coach's review shows the rest the Session
 * Drawer shows for the same session and the same Target Race date.
 */
const DRAFTED: ProposedSession[] = [
  { date: '2026-09-22', type: 'Endurance', durationMinutes: 90, zone: 'Z2', note: 'easy', sport: 'bike', cue: 'Spin light.' },
  { date: '2026-09-24', type: 'Intensity', durationMinutes: 60, zone: 'Z4', note: null, sport: 'run' },
];

const mainDetail = (h: { segments: { name: string; detail: string | null }[] } | null) =>
  h!.segments.find((x) => x.name === 'main')!.detail;

describe('howToOfRow with a Target Race date', () => {
  it('gives the review row the same rest the drawer gives, and starts editing from it', () => {
    const [, run] = rowsOf(DRAFTED); // Intensity, run, 60 min, Z4, 2026-09-24
    const race = '2026-10-30'; // 36 days out
    const row = howToOfRow(run, 'en', race)!;
    expect(mainDetail(row)).toBe('10 × 1 min, 1 min Z1 between');
    expect(row.segments).toEqual(
      howToOf(
        { origin: 'coach', type: 'Intensity', sport: 'run', duration: 60, zone: 'Z4', howTo: null },
        'en',
        racePhaseOf('2026-09-24', race),
      )!.segments,
    );
    expect(startEditing(run, 'en', race)!.segments).toEqual(row.segments);
    expect(mainDetail(howToOfRow(run, 'en', null))).toBe('10 × 1 min, 2 min Z1 between (full recovery)');
  });

  it('keeps today’s rest with no race date given, or a race 56 days or more away', () => {
    const [, run] = rowsOf(DRAFTED);
    const today = mainDetail(howToOfRow(run, 'en'));
    expect(today).toBe('10 × 1 min, 2 min Z1 between (full recovery)');
    expect(mainDetail(howToOfRow(run, 'en', '2026-11-19'))).toBe(today); // 56 days out
  });
});
