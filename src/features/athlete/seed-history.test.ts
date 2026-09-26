import { describe, it, expect } from 'vitest';
import { seedAthleteSessionId, seedWeekRows } from './seed-history';

/**
 * The week of history `scripts/seed.ts` gives the real dev athlete, as data.
 *
 * Since code-health/13 this is the only seeded training on any calendar, and
 * one row of it carries an acceptance criterion: the Head Coach's plan surface
 * must show an Athlete Session — `origin: 'athlete'`, "athlete's own", no edit
 * and no delete — on an athlete a tester can reach. That row is asserted here
 * rather than trusted to the seed.
 */

// A Wednesday, so the "last Mon–Sun" arithmetic is exercised off a midweek day.
// An instant, not local wall-clock time: `ratedAt` is `now` itself and the
// snapshot stores it as UTC, so `new Date(2026, 8, 16, 10, 30)` pinned 08:30Z
// in Copenhagen and 10:30Z on a UTC machine (every cloud sandbox). 08:30Z is
// Wednesday the 16th in both zones, so the date arithmetic is unchanged.
const NOW = new Date('2026-09-16T08:30:00Z');
const ATHLETE = 'a0000000-0000-4000-8000-000000000001';

describe('seedWeekRows', () => {
  // The copy the tester reads — titles, notes, zones, reflections — pinned the
  // way the generator's histories are: a change here should be a change
  // someone meant, and the diff is the review artifact.
  it('is the same week every time, down to the copy', () => {
    expect(seedWeekRows(ATHLETE, NOW)).toMatchSnapshot();
  });

  it('lays last week across Mon–Sun, in the past, all completed', () => {
    const rows = seedWeekRows(ATHLETE, NOW);
    const dates = rows.map((r) => r.date);
    expect(Math.min(...dates.map((d) => Date.parse(d)))).toBe(Date.parse('2026-09-07'));
    expect(Math.max(...dates.map((d) => Date.parse(d)))).toBe(Date.parse('2026-09-13'));
    // Sunday of the previous week, whatever weekday `now` is.
    expect(seedWeekRows(ATHLETE, new Date(2026, 8, 14)).map((r) => r.date)).toEqual(dates);
    for (const r of rows) {
      expect(r.athleteId).toBe(ATHLETE);
      expect(r.status).toBe('completed');
      expect(r.dayOrder).toBe(0);
      expect(r.isTraining).toBe(true);
    }
  });

  it('carries exactly one Athlete Session, with an id derived from the athlete so a reseed converges on it', () => {
    const own = seedWeekRows(ATHLETE, NOW).filter((r) => r.origin === 'athlete');
    expect(own).toHaveLength(1);
    expect(own[0].id).toBe(seedAthleteSessionId(ATHLETE));
    // Stable across runs, a valid UUID, and different for another athlete on
    // the same database — two seeded athletes (the /preview skill's case)
    // must never collide on the primary key.
    expect(seedAthleteSessionId(ATHLETE)).toBe(seedAthleteSessionId(ATHLETE));
    expect(seedAthleteSessionId(ATHLETE)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(seedAthleteSessionId('another-athlete')).not.toBe(seedAthleteSessionId(ATHLETE));
    // Strength is an Athlete Session type (athlete-session-rules.ts); a
    // coach-origin Strength row is one the app's own rules would refuse.
    expect(own[0].type).toBe('Strength');
    expect(own[0].date).toBe('2026-09-13');
  });

  it('leaves the Coach-origin rows without an id, so the database mints them', () => {
    const coach = seedWeekRows(ATHLETE, NOW).filter((r) => r.origin === 'coach');
    expect(coach).toHaveLength(5);
    for (const r of coach) expect(r.id).toBeUndefined();
  });

  it('stamps ratedAt only where a Session Reflection was given', () => {
    const rows = seedWeekRows(ATHLETE, NOW);
    const rated = rows.filter((r) => r.feedbackBody != null);
    expect(rated).toHaveLength(2);
    for (const r of rows) {
      expect(r.ratedAt).toEqual(r.feedbackBody != null ? NOW : null);
      expect(r.feedbackMind != null).toBe(r.feedbackBody != null);
    }
  });
});
