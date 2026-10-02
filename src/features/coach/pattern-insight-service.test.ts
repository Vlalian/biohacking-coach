import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, weekStartOf } from '@/lib/date';
import type { Session } from '@/features/session/session';
import { surfacePatterns } from './pattern-insight-service';

/**
 * Detect, log every detection, hand over the strongest few
 * (`training-architecture/50`, rulings 7, 8 and 10). The detector itself is
 * tested in `pattern-insight.test.ts`; this is the step both surfaces share.
 */

const today = '2026-10-01';

/** Four weeks of Tuesday/Thursday/Saturday sessions, every Tuesday skipped, every Thursday rated 1 then a skip. */
function history(): Session[] {
  const out: Session[] = [];
  for (let w = 4; w >= 1; w--) {
    const monday = addDays(weekStartOf(today), -7 * w);
    for (const [offset, over] of [
      [1, { status: 'skipped', feedbackBody: null, feedbackMind: null }],
      [3, { feedbackBody: 1 }],
      [5, {}],
    ] as const) {
      const row: Session = {
        id: `s${w}${offset}`,
        date: addDays(monday, offset),
        type: 'Endurance',
        status: 'completed',
        parked: false,
        dayOrder: 0,
        title: null,
        duration: 60,
        zone: null,
        note: null,
        sport: null,
        feedbackBody: 4,
        feedbackMind: 4,
        feedbackComment: null,
        origin: 'coach',
        isTraining: true,
        summary: null,
        version: 1,
        howTo: null,
      };
      out.push({ ...row, ...over } as Session);
    }
  }
  return out;
}

const context = { patternSessions: history(), patternMoves: [] };

afterEach(() => vi.restoreAllMocks());

describe('surfacePatterns', () => {
  it('hands Coach Chat the strongest three it found, schedule and report alike', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const shown = surfacePatterns('a1', 'coach_chat', context, today);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThanOrEqual(3);
    expect(shown.map((p) => p.family)).toContain('schedule');
    expect(shown.some((p) => p.section === 'reports')).toBe(true);
    expect([...shown].sort((a, b) => b.strength - a.strength)).toEqual(shown);
  });

  it('hands the Briefing only what Link Visibility lets the coach see', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hidden = surfacePatterns('a1', 'briefing', context, today, { shareAthleteReports: false, shareAiTranscripts: true });
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every((p) => p.section === 'always')).toBe(true);
    const shared = surfacePatterns('a1', 'briefing', context, today, { shareAthleteReports: true, shareAiTranscripts: false });
    expect(shared.some((p) => p.section === 'reports')).toBe(true);
  });

  it('logs every detection, marking which were handed over', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const shown = surfacePatterns('a1', 'briefing', context, today, { shareAthleteReports: false, shareAiTranscripts: false });
    const lines = warn.mock.calls.map(([line]) => JSON.parse(line as string));
    expect(lines.length).toBeGreaterThan(shown.length);
    expect(lines.every((l) => l.event === 'pattern_detected' && l.surface === 'briefing' && l.athleteId === 'a1')).toBe(true);
    expect(lines.filter((l) => l.said).map((l) => l.family)).toEqual(shown.map((p) => p.family));
  });

  it('with too little history, hands over and logs nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(surfacePatterns('a1', 'coach_chat', { patternSessions: history().slice(0, 4), patternMoves: [] }, today)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});
