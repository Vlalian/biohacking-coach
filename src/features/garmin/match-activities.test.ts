import { describe, it, expect } from 'vitest';
import { matchActivities, type MatchCandidate } from './match-activities';

/**
 * The match-preference table from showable-version/14, and from the retired
 * garmin-sync/03 that specified it before the Next.js rewrite dropped it.
 *
 * Pure: an activity and the day's Planned Sessions in, a session id or null
 * out. Nothing here decides what happens to the match — that is the accept
 * path's job, and it is what keeps detection from asserting.
 */

const DAY = '2026-07-15';

function planned(over: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: 'p1',
    date: DAY,
    type: 'Endurance',
    status: 'planned',
    parked: false,
    dayOrder: 0,
    ...over,
  };
}

function activity(over: { date?: string; sessionType?: string } = {}) {
  return { date: DAY, sessionType: 'Endurance', ...over };
}

/** Just the matched ids, in activity order. */
function ids(activities: ReturnType<typeof activity>[], candidates: MatchCandidate[]) {
  return matchActivities(activities, candidates).map((m) => m.matchedSessionId);
}

describe('matchActivities', () => {
  it('matches the one Planned Session on the day', () => {
    expect(ids([activity()], [planned()])).toEqual(['p1']);
  });

  it('matches a Planned Session of a different type when it is the only one', () => {
    // Type is a preference, not a requirement — an athlete who rides on a
    // planned Tempo day still did that day's session.
    expect(ids([activity({ sessionType: 'Endurance' })], [planned({ type: 'Tempo' })])).toEqual([
      'p1',
    ]);
  });

  it('prefers the same type over the earlier dayOrder on a Double day', () => {
    const candidates = [
      planned({ id: 'recovery', type: 'Recovery', dayOrder: 0 }),
      planned({ id: 'endurance', type: 'Endurance', dayOrder: 1 }),
    ];

    expect(ids([activity({ sessionType: 'Endurance' })], candidates)).toEqual(['endurance']);
  });

  it('falls back to the earliest dayOrder when no type matches', () => {
    const candidates = [
      planned({ id: 'second', type: 'Tempo', dayOrder: 1 }),
      planned({ id: 'first', type: 'Recovery', dayOrder: 0 }),
    ];

    expect(ids([activity({ sessionType: 'Endurance' })], candidates)).toEqual(['first']);
  });

  it('never matches one Planned Session twice, and runs out honestly', () => {
    // Two uploads on a Double day complete both; a third has nothing left.
    const candidates = [
      planned({ id: 'a', dayOrder: 0 }),
      planned({ id: 'b', dayOrder: 1 }),
    ];

    expect(ids([activity(), activity(), activity()], candidates)).toEqual(['a', 'b', null]);
  });

  it('never matches a parked session', () => {
    expect(ids([activity()], [planned({ parked: true })])).toEqual([null]);
  });

  it('never matches a session that is not planned', () => {
    for (const status of ['completed', 'skipped', 'unavailable']) {
      expect(ids([activity()], [planned({ status })])).toEqual([null]);
    }
  });

  it('never matches across days', () => {
    expect(ids([activity({ date: '2026-07-16' })], [planned({ date: DAY })])).toEqual([null]);
  });

  it('returns null rather than inventing a session when the day is empty', () => {
    expect(ids([activity()], [])).toEqual([null]);
  });

  it('keeps every activity, matched or not', () => {
    const matched = matchActivities([activity(), activity({ date: '2026-07-16' })], [planned()]);

    expect(matched).toHaveLength(2);
    expect(matched[0].activity.date).toBe(DAY);
    expect(matched[1].activity.date).toBe('2026-07-16');
  });
});
