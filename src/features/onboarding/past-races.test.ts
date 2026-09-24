import { describe, it, expect } from 'vitest';
import { deriveExperienceLevel, experienceFromCount, formatFinish, parseFinishInput, parsePastRace } from './past-races';

/**
 * `training-architecture/35` — the athlete lists the races they have finished;
 * their experience level is derived from the list, never asked.
 */
const races = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    distance: 'Olympic' as const,
    date: `2024-0${(i % 9) + 1}-01`,
    finishSeconds: null,
    note: null,
  }));

describe('deriveExperienceLevel — from what the athlete has finished', () => {
  it.each([
    [0, 'beginner'],
    [1, 'intermediate'],
    [2, 'intermediate'],
    [3, 'intermediate'],
    [4, 'veteran'],
    [10, 'veteran'],
  ] as const)('%i past races → %s', (n, level) => {
    expect(deriveExperienceLevel(races(n))).toBe(level);
    expect(experienceFromCount(n)).toBe(level);
  });
});

describe('parsePastRace — the shape a list entry must have', () => {
  const TODAY = '2026-09-21';

  it('accepts distance, date, optional finish and note; absent optionals become null', () => {
    expect(
      parsePastRace({ distance: 'Half', date: '2025-08-16', finishSeconds: 5 * 3600 + 12 * 60, note: 'hot day' }, TODAY),
    ).toEqual({ distance: 'Half', date: '2025-08-16', finishSeconds: 18720, note: 'hot day' });
    expect(parsePastRace({ distance: 'Sprint', date: TODAY }, TODAY)).toEqual({
      distance: 'Sprint', date: TODAY, finishSeconds: null, note: null,
    });
    // A blank note is no note; a note is trimmed.
    expect(parsePastRace({ distance: 'Full', date: '2024-01-01', note: '  ' }, TODAY)?.note).toBeNull();
    expect(parsePastRace({ distance: 'Full', date: '2024-01-01', note: ' windy ' }, TODAY)?.note).toBe('windy');
  });

  it('refuses an unknown distance, a future date, a bad date, a zero or day-long finish, a fractional finish and a note over 200 chars', () => {
    expect(parsePastRace({ distance: 'Ultra', date: '2025-08-16' }, TODAY)).toBeNull();
    expect(parsePastRace({ distance: 'Half', date: '2026-09-22' }, TODAY)).toBeNull();
    expect(parsePastRace({ distance: 'Half', date: 'yesterday' }, TODAY)).toBeNull();
    expect(parsePastRace({ distance: 'Half', date: '2025-08-16', finishSeconds: 0 }, TODAY)).toBeNull();
    expect(parsePastRace({ distance: 'Half', date: '2025-08-16', finishSeconds: 24 * 3600 }, TODAY)).toBeNull();
    expect(parsePastRace({ distance: 'Half', date: '2025-08-16', finishSeconds: 10.5 }, TODAY)).toBeNull();
    expect(parsePastRace({ distance: 'Half', date: '2025-08-16', finishSeconds: '5h' }, TODAY)).toBeNull();
    expect(parsePastRace({ distance: 'Half', date: '2025-08-16', note: 'x'.repeat(201) }, TODAY)).toBeNull();
    expect(parsePastRace({ distance: 'Half', date: '2025-08-16', note: 42 }, TODAY)).toBeNull();
    expect(parsePastRace(null, TODAY)).toBeNull();
    expect(parsePastRace(undefined, TODAY)).toBeNull();
    expect(parsePastRace('Half', TODAY)).toBeNull();
    expect(parsePastRace(0, TODAY)).toBeNull();
    expect(parsePastRace([], TODAY)).toBeNull();
    expect(parsePastRace({ distance: 42, date: '2025-08-16' }, TODAY)).toBeNull();
    // Boundaries: today is allowed, a 200-character note is allowed, one second is a finish.
    expect(parsePastRace({ distance: 'Half', date: TODAY }, TODAY)).not.toBeNull();
    expect(parsePastRace({ distance: 'Half', date: '2025-08-16', note: 'x'.repeat(200) }, TODAY)?.note).toHaveLength(200);
    expect(parsePastRace({ distance: 'Half', date: '2025-08-16', finishSeconds: 1 }, TODAY)?.finishSeconds).toBe(1);
    expect(parsePastRace({ distance: 'Half', date: '2025-08-16', finishSeconds: 24 * 3600 - 1 }, TODAY)?.finishSeconds).toBe(86399);
  });
});

describe('finish times as the athlete types them', () => {
  it('parseFinishInput reads h:mm and h:mm:ss, blank is none, anything else is unreadable', () => {
    expect(parseFinishInput('5:12')).toBe(18720);
    expect(parseFinishInput(' 5:12:30 ')).toBe(18750);
    expect(parseFinishInput('12:05')).toBe(43500);
    expect(parseFinishInput('')).toBeNull();
    expect(parseFinishInput('   ')).toBeNull();
    expect(parseFinishInput('05:12')).toBe(18720);
    expect(parseFinishInput('0:01')).toBe(60);
    // A day or longer is refused here as well as in `parsePastRace`: the two
    // parsers disagreeing let the form enable Add on a value the server then
    // refuses, and the athlete sees only the generic error (CodeRabbit, PR #98).
    for (const bad of ['5', '5:6', '5:60', '5:12:5', '5:12:60', '5h12', '0:00', 'abc', '123:00', '5:12:30:1', ':12', '24:00', '24:00:00', '99:59:59']) {
      expect(parseFinishInput(bad), bad).toBeUndefined();
    }
  });

  it('formatFinish is the inverse: h:mm, with seconds only when there are any', () => {
    expect(formatFinish(18720)).toBe('5:12');
    expect(formatFinish(18750)).toBe('5:12:30');
    expect(formatFinish(60)).toBe('0:01');
    expect(formatFinish(3605)).toBe('1:00:05');
  });
});
