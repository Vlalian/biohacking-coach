import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The Head Coach's calendar is the athlete's `Calendar` with the coach's props
 * (`showable-version/20`), so almost everything it does is tested there. What
 * is only true here is the health layer's gate: `getCoachAthleteView` returns
 * `null` — never `[]` — when the athlete withholds their reports, precisely so
 * "no injuries" cannot be told from "not shared". A `?? []` on the way in threw
 * that away and the week rendered "uninjured · healthy" for an athlete who had
 * shared nothing (`showable-version/28b`).
 */
describe('CoachCalendar — the health layer the athlete may have withheld', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./coach-calendar.tsx', import.meta.url)),
    'utf8',
  );

  it('hands the calendar null when the athlete withholds reports, never an empty layer', () => {
    expect(source).not.toMatch(/health=\{health \?\? \[\]\}/);
    expect(source).toContain('health={health}');
  });
});
