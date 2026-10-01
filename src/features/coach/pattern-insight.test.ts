import { describe, expect, it } from 'vitest';
import { addDays, weekStartOf } from '@/lib/date';
import type { Session } from '@/features/session/session';
import {
  detectPatterns,
  patternHistoryOf,
  topPatterns,
  visiblePatterns,
  type Pattern,
  type PatternSession,
} from './pattern-insight';

/**
 * Pattern Insight (`training-architecture/50`): code finds candidate patterns in
 * an athlete's own history, against their own robust baseline (median and MAD),
 * and Momentum only decides whether to say one.
 */

const today = '2026-10-01'; // a Thursday; its week starts Monday 2026-09-28

const s = (date: string, over: Partial<PatternSession> = {}): PatternSession => ({
  date,
  type: 'Endurance',
  sport: null,
  status: 'completed',
  duration: 60,
  body: 4,
  mind: 4,
  avgHr: null,
  distanceM: null,
  ...over,
});

/** Tuesday, Thursday, Saturday, then Monday and Sunday, for `perWeek` sessions. */
const OFFSETS = [1, 3, 5, 0, 6];

/** `n` weeks of sessions ending the week before today's, oldest first; `over` gets a running index. */
function weeks(
  n: number,
  perWeek: number,
  over: (i: number, date: string) => Partial<PatternSession> = () => ({}),
): PatternSession[] {
  const out: PatternSession[] = [];
  let i = 0;
  for (let w = n; w >= 1; w--) {
    const monday = addDays(weekStartOf(today), -7 * w);
    for (let k = 0; k < perWeek; k++) {
      const date = addDays(monday, OFFSETS[k]);
      out.push(s(date, over(i, date)));
      i++;
    }
  }
  return out;
}

const detect = (sessions: PatternSession[], moves: { from: string; to: string; by: string }[] = []) =>
  detectPatterns({ sessions, moves, today });

describe('minimum history', () => {
  it('names nothing under three weeks or six rated sessions', () => {
    expect(detect(weeks(2, 4, () => ({ body: 1, status: 'skipped' })))).toEqual([]);
    const fiveRated = weeks(4, 3, (i) => (i < 5 ? { body: 1 } : { body: null, mind: null, status: 'skipped' }));
    expect(detect(fiveRated)).toEqual([]);
  });
});

describe('shift: Body or Mind moving away from the athlete\'s own normal', () => {
  it('finds Body moving down from the athlete\'s own median, with the numbers behind it', () => {
    // Five weeks at 4, then last week at 1.
    const history = weeks(6, 3, (i) => ({ body: i >= 15 ? 1 : 4 }));
    const shift = detect(history).find((p) => p.family === 'shift');
    expect(shift).toMatchObject({ subject: 'body', metric: 'body', direction: 'down', section: 'reports' });
    expect(shift?.numbers).toEqual({ baseline: 4, recent: 1 });
    expect(shift?.sample).toBe(18);
    expect(shift?.strength).toBeGreaterThanOrEqual(2);
  });

  it('finds Mind moving up as well as down', () => {
    const history = weeks(6, 3, (i) => ({ mind: i >= 15 ? 5 : 2 }));
    expect(detect(history)).toContainEqual(
      expect.objectContaining({ family: 'shift', subject: 'mind', direction: 'up' }),
    );
  });

  it('does not call ordinary variation a shift', () => {
    const noisy = weeks(6, 3, (i) => ({ body: [3, 4, 5][i % 3] }));
    expect(detect(noisy).filter((p) => p.family === 'shift')).toEqual([]);
  });

  it('a one-step change from a perfectly steady baseline is not a shift', () => {
    // MAD is zero; the floor of half a step keeps this from reading as huge.
    const history = weeks(6, 3, (i) => ({ body: i >= 15 ? 3 : 4 }));
    expect(detect(history).filter((p) => p.family === 'shift')).toEqual([]);
  });

  it('needs at least two recent ratings to call a week different', () => {
    // Last week: two skips and one low rating. One rating is not a week.
    const history = weeks(6, 3, (i) =>
      i === 15 || i === 16 ? { status: 'skipped', body: null, mind: null } : { body: i === 17 ? 1 : 4 },
    );
    expect(detect(history).filter((p) => p.family === 'shift')).toEqual([]);
  });
});

describe('kind: one Session Type, sport or weekday rated clearly differently', () => {
  it('finds Intensity sessions rated clearly lower than the rest', () => {
    const history = weeks(4, 4, (i) => (i % 4 === 0 ? { type: 'Intensity', body: 1 } : { body: 4 }));
    expect(detect(history)).toContainEqual(
      expect.objectContaining({
        family: 'kind',
        subject: 'Intensity',
        metric: 'body',
        direction: 'down',
        section: 'reports',
        numbers: { median: 1, others: 4, sessions: 4 },
      }),
    );
  });

  it('finds a sport rated clearly higher, and a weekday', () => {
    const history = weeks(4, 4, (i) => (i % 4 === 1 ? { sport: 'swimming', mind: 5 } : { mind: 2 }));
    const kinds = detect(history).filter((p) => p.family === 'kind' && p.metric === 'mind');
    expect(kinds).toContainEqual(expect.objectContaining({ subject: 'swimming', direction: 'up' }));
    // Every swim fell on a Thursday, so the weekday shows the same gap.
    expect(kinds).toContainEqual(expect.objectContaining({ subject: 'Thursday', direction: 'up' }));
  });

  it('needs the gap on at least three sessions', () => {
    const history = weeks(4, 4, (i) => (i === 0 || i === 4 ? { type: 'Intensity', body: 1 } : { body: 4 }));
    expect(detect(history).filter((p) => p.family === 'kind' && p.subject === 'Intensity')).toEqual([]);
  });

  it('does not compare a kind with nothing', () => {
    // Every session is Endurance: there are no others to differ from.
    expect(detect(weeks(4, 4, () => ({ body: 2 }))).filter((p) => p.family === 'kind')).toEqual([]);
  });
});

describe('schedule: skips or moves clustering on one weekday', () => {
  // Tuesday, Thursday, Saturday for four weeks; every Tuesday skipped.
  const skippedTuesdays = weeks(4, 3, (i) => (i % 3 === 0 ? { status: 'skipped', body: null, mind: null } : {}));

  it('finds skips clustering on Tuesdays from statuses alone, as an always-visible pattern', () => {
    const p = detect(skippedTuesdays).find((x) => x.family === 'schedule');
    expect(p).toMatchObject({ subject: 'Tuesday', direction: null, section: 'always', numbers: { skipped: 4, of: 4 } });
    expect(p?.metric).toBeUndefined();
  });

  it('does not count a weekday the athlete mostly trains on', () => {
    const someSkipped = skippedTuesdays.map((x, i) => (i === 0 || i === 3 ? { ...x, status: 'completed', body: 4, mind: 4 } : x));
    // Two of four Tuesdays skipped: under three, so not a pattern.
    expect(detect(someSkipped).filter((p) => p.family === 'schedule')).toEqual([]);
  });

  it('finds a weekday the athlete keeps moving sessions away from', () => {
    const moves = ['2026-09-08', '2026-09-15', '2026-09-22'].map((from) => ({ from, to: addDays(from, 1), by: 'athlete' }));
    expect(detect(weeks(4, 3), moves)).toContainEqual(
      expect.objectContaining({ family: 'schedule', subject: 'Tuesday', section: 'always', numbers: { moved: 3 } }),
    );
  });

  it('a Head Coach moving sessions is not the athlete\'s schedule', () => {
    const moves = ['2026-09-08', '2026-09-15', '2026-09-22'].map((from) => ({ from, to: addDays(from, 1), by: 'head_coach' }));
    expect(detect(weeks(4, 3), moves).filter((p) => p.family === 'schedule')).toEqual([]);
  });
});

describe('body push-back: a skip following a low-rated session', () => {
  it('pairs a skip with the rating before it, since a skipped session carries none', () => {
    // Each week: Tuesday fine, Thursday rated 1, Saturday skipped, Monday fine.
    const history = weeks(4, 4, (i) =>
      i % 4 === 1 ? { body: 1 } : i % 4 === 2 ? { status: 'skipped', body: null, mind: null } : {},
    );
    expect(detect(history)).toContainEqual(
      expect.objectContaining({ family: 'body-push-back', direction: null, section: 'reports', numbers: { pairs: 4 } }),
    );
  });

  it('a skip after a well-rated session is not push-back', () => {
    const history = weeks(4, 4, (i) => (i % 4 === 2 ? { status: 'skipped', body: null, mind: null } : { body: 4 }));
    expect(detect(history).filter((p) => p.family === 'body-push-back')).toEqual([]);
  });
});

describe('low Body after Intensity, the old rule that runs now', () => {
  it('finds low Body the session after an Intensity session, with the type as stored', () => {
    const history = weeks(4, 4, (i) => (i % 4 === 0 ? { type: 'Intensity' } : i % 4 === 1 ? { body: 1 } : {}));
    expect(detect(history)).toContainEqual(
      expect.objectContaining({ family: 'low-body-after-intensity', section: 'reports', numbers: { times: 4 } }),
    );
  });

  it('counts a Body well below the athlete\'s own normal as low, not only a 1 or 2', () => {
    const history = weeks(4, 4, (i) => (i % 4 === 0 ? { type: 'Intensity', body: 5 } : i % 4 === 1 ? { body: 3 } : { body: 5 }));
    expect(detect(history).map((p) => p.family)).toContain('low-body-after-intensity');
  });

  it('is silent when the session after Intensity feels fine', () => {
    const history = weeks(4, 4, (i) => (i % 4 === 0 ? { type: 'Intensity' } : {}));
    expect(detect(history).filter((p) => p.family === 'low-body-after-intensity')).toEqual([]);
  });
});

describe('the three dormant rules', () => {
  it('stay silent while nothing records sleep, resting pulse or push-back', () => {
    const history = weeks(6, 4, () => ({ type: 'Intensity', body: 1, mind: 1 }));
    const families = detect(history).map((p) => p.family);
    expect(families).not.toContain('sleep-intensity');
    expect(families).not.toContain('pulse-push-back');
    expect(families).not.toContain('sleep-mind');
  });

  it('wake the day their fields exist', () => {
    const history = weeks(4, 4, () => ({ type: 'Intensity', sleepHours: 5, restingPulse: 70, pushedBack: true, mind: 1 }));
    expect(detect(history)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ family: 'sleep-intensity', section: 'reports', numbers: { times: 16 } }),
        expect.objectContaining({ family: 'pulse-push-back', section: 'reports', numbers: { times: 16 } }),
        expect.objectContaining({ family: 'sleep-mind', section: 'reports', numbers: { times: 16 } }),
      ]),
    );
  });

  it('each needs all of its fields, not most of them', () => {
    const history = weeks(4, 4, () => ({ type: 'Endurance', sleepHours: 7, restingPulse: 50, pushedBack: true, mind: 4 }));
    const families = detect(history).map((p) => p.family);
    expect(families).not.toContain('sleep-intensity');
    expect(families).not.toContain('pulse-push-back');
    expect(families).not.toContain('sleep-mind');
  });
});

describe('effort drift: same sport, similar duration, over weeks', () => {
  it('finds average heart rate drifting up for similar runs, as an athlete report', () => {
    // Six weeks of two runs; the last two weeks at 156 bpm, the four before at 140.
    const history = weeks(6, 2, (i) => ({ sport: 'running', duration: 45 + (i % 2), avgHr: i < 8 ? 140 : 156 }));
    expect(detect(history)).toContainEqual(
      expect.objectContaining({
        family: 'effort-drift',
        subject: 'running',
        metric: 'heart rate',
        direction: 'up',
        section: 'reports',
        numbers: { baseline: 140, recent: 156 },
      }),
    );
  });

  it('finds pace dropping off from distance over time', () => {
    // 10 km in 50 minutes, then 8 km in the same time for the last two weeks.
    const history = weeks(6, 2, (i) => ({ sport: 'running', duration: 50, distanceM: i < 8 ? 10000 : 8000 }));
    expect(detect(history)).toContainEqual(
      expect.objectContaining({ family: 'effort-drift', subject: 'running', metric: 'pace', direction: 'down' }),
    );
  });

  it('does not compare sessions of different lengths', () => {
    const history = weeks(6, 2, (i) => ({ sport: 'running', duration: i < 8 ? 30 : 90, avgHr: i < 8 ? 140 : 156 }));
    expect(detect(history).filter((p) => p.family === 'effort-drift')).toEqual([]);
  });

  it('ignores steady effort and sessions with no sport', () => {
    const steady = weeks(6, 2, (i) => ({ sport: 'running', duration: 45, avgHr: [140, 142, 141][i % 3] }));
    expect(detect(steady).filter((p) => p.family === 'effort-drift')).toEqual([]);
    const noSport = weeks(6, 2, (i) => ({ duration: 45, avgHr: i < 8 ? 140 : 156 }));
    expect(detect(noSport).filter((p) => p.family === 'effort-drift')).toEqual([]);
  });
});

describe('what is handed over', () => {
  const base: Pattern = {
    family: 'shift',
    subject: 'body',
    metric: 'body',
    direction: 'down',
    numbers: { baseline: 4, recent: 2 },
    sample: 12,
    strength: 3,
    section: 'reports',
  };

  it('the three strongest, strongest first', () => {
    const found = [1, 5, 3, 4].map((strength) => ({ ...base, strength }));
    expect(topPatterns(found).map((p) => p.strength)).toEqual([5, 4, 3]);
    expect(topPatterns(found, 1).map((p) => p.strength)).toEqual([5]);
    expect(found.map((p) => p.strength)).toEqual([1, 5, 3, 4]);
  });

  it('drops patterns built from athlete reports when the athlete does not share them', () => {
    const schedule: Pattern = { ...base, family: 'schedule', section: 'always' };
    const found = [base, schedule];
    expect(visiblePatterns(found, { shareAthleteReports: false, shareAiTranscripts: true })).toEqual([schedule]);
    expect(visiblePatterns(found, { shareAthleteReports: true, shareAiTranscripts: false })).toEqual(found);
  });
});

describe('patternHistoryOf: the stored session as Pattern Insight reads it', () => {
  const session = (over: Partial<Session> = {}): Session => ({
    id: 's1',
    date: '2026-09-22',
    type: 'Endurance',
    status: 'completed',
    parked: false,
    dayOrder: 0,
    title: null,
    duration: 45,
    zone: null,
    note: null,
    sport: 'running',
    feedbackBody: 2,
    feedbackMind: 3,
    feedbackComment: 'heavy legs',
    origin: 'garmin',
    isTraining: true,
    summary: { avgHr: 150, distanceM: 9000 },
    version: 1,
    ...over,
  });

  it('reads ratings, status, sport, duration and the device summary', () => {
    expect(patternHistoryOf([session()])).toEqual([
      {
        date: '2026-09-22',
        type: 'Endurance',
        sport: 'running',
        status: 'completed',
        duration: 45,
        body: 2,
        mind: 3,
        avgHr: 150,
        distanceM: 9000,
      },
    ]);
  });

  it('a session with no device summary has no effort numbers, and never the comment', () => {
    const [x] = patternHistoryOf([session({ summary: null })]);
    expect(x).toMatchObject({ avgHr: null, distanceM: null });
    expect(JSON.stringify(x)).not.toContain('heavy legs');
  });
});


/** The Monday `w` weeks before today's week. */
const mondayOf = (w: number) => addDays(weekStartOf(today), -7 * w);
const familyOf = (found: Pattern[], family: string) => found.filter((p) => p.family === family);

describe('boundaries: who counts as rated, and how much history is enough', () => {
  it('a session rated on Mind alone counts as rated', () => {
    const history = weeks(6, 3, (i) => ({ body: null, mind: i >= 15 ? 1 : 4 }));
    expect(familyOf(detect(history), 'shift')).toEqual([
      expect.objectContaining({ subject: 'mind', direction: 'down', numbers: { baseline: 4, recent: 1 } }),
    ]);
  });

  it('a session rated on Body alone counts as rated', () => {
    const history = weeks(6, 3, (i) => ({ mind: null, body: i >= 15 ? 1 : 4 }));
    expect(familyOf(detect(history), 'shift').map((p) => p.subject)).toEqual(['body']);
  });

  it('exactly six rated sessions over exactly three weeks is enough', () => {
    // Three weeks of Tuesday skipped, Thursday and Saturday rated.
    const history = weeks(3, 3, (i) => (i % 3 === 0 ? { status: 'skipped', body: null, mind: null } : {}));
    expect(familyOf(detect(history), 'schedule')).toEqual([
      expect.objectContaining({ subject: 'Tuesday', numbers: { skipped: 3, of: 3 } }),
    ]);
  });

  it('eight rated sessions in two weeks is not, even with a pattern in it', () => {
    // Three moves away from Tuesday would be a schedule pattern; two weeks is too little to name it.
    const moves = [1, 2, 3].map(() => ({ from: addDays(mondayOf(1), 1), to: addDays(mondayOf(1), 2), by: 'athlete' }));
    expect(detect(weeks(2, 4), moves)).toEqual([]);
  });
});

describe('boundaries: the median', () => {
  it('is the middle of the sorted values, not of the order they arrived in', () => {
    // Baseline bodies 5,1,4,2,5,1,4,2,5: sorted, the middle is 4.
    const bodies = [5, 1, 4, 2, 5, 1, 4, 2, 5, 1, 1, 1];
    const history = weeks(4, 3, (i) => ({ body: bodies[i] }));
    expect(familyOf(detect(history), 'shift')).toEqual([
      expect.objectContaining({ subject: 'body', numbers: { baseline: 4, recent: 1 } }),
    ]);
  });

  it('of an even count is the mean of the two middle values', () => {
    const bodies = [4, 3, 4, 3, 1, 1];
    const [shift] = familyOf(detect(weeks(3, 2, (i) => ({ body: bodies[i] }))), 'shift');
    expect(shift).toMatchObject({ numbers: { baseline: 3.5, recent: 1 } });
    // |1 - 3.5| / (1.4826 x 0.5)
    expect(shift.strength).toBeCloseTo(2.5 / (1.4826 * 0.5), 6);
  });
});

describe('boundaries: the recent week of a shift', () => {
  it('starts on the Monday of last week, and two ratings there are enough', () => {
    // Last week: Monday and Tuesday rated 1, Thursday and Saturday skipped.
    const history = weeks(6, 4, (i) => {
      if (i < 20) return {};
      return i === 20 || i === 23 ? { body: 1 } : { status: 'skipped', body: null, mind: null };
    });
    expect(familyOf(detect(history), 'shift')).toEqual([
      expect.objectContaining({ subject: 'body', direction: 'down', numbers: { baseline: 4, recent: 1 } }),
    ]);
  });

  it('names no shift for a measure with nothing before the recent week', () => {
    // Body is rated only last week; Mind carries the history.
    const history = weeks(6, 3, (i) => ({ body: i >= 15 ? 1 : null }));
    expect(familyOf(detect(history), 'shift')).toEqual([]);
  });
});

describe('boundaries: kind', () => {
  it('three sessions of a kind against three others is enough, and the sample counts both', () => {
    // Three weeks: Tuesday Intensity rated 1, Thursday Endurance rated 4.
    const history = weeks(3, 2, (i) => (i % 2 === 0 ? { type: 'Intensity', body: 1 } : { body: 4 }));
    expect(familyOf(detect(history), 'kind').filter((p) => p.subject === 'Intensity')).toEqual([
      expect.objectContaining({ metric: 'body', direction: 'down', numbers: { median: 1, others: 4, sessions: 3 }, sample: 6 }),
    ]);
  });

  it('needs three others to compare with', () => {
    // Seven Intensity, two Endurance: neither side of Endurance has enough to stand on.
    const history = weeks(3, 3, (i) => (i < 7 ? { type: 'Intensity', body: 1 } : { body: 4 }));
    expect(familyOf(detect(history), 'kind').filter((p) => p.subject === 'Intensity' || p.subject === 'Endurance')).toEqual([]);
  });

  it('counts only the rated sessions of a kind, and never a session with no sport as a kind', () => {
    const history = weeks(4, 4, (i) => {
      if (i % 4 === 0) return { sport: 'swimming', body: 5 };
      if (i % 4 === 1) return { sport: 'swimming', body: null, mind: null };
      return { body: 2 };
    });
    const kinds = familyOf(detect(history), 'kind').filter((p) => p.metric === 'body');
    expect(kinds).toContainEqual(
      expect.objectContaining({ subject: 'swimming', direction: 'up', numbers: { median: 5, others: 2, sessions: 4 } }),
    );
    expect(kinds.map((p) => p.subject)).not.toContain(null);
  });
});

describe('boundaries: schedule', () => {
  /** Tuesdays (index % 3 === 0) of `n` weeks, each set by `tuesday(week)`. */
  const withTuesdays = (n: number, tuesday: (week: number) => Partial<PatternSession>) =>
    weeks(n, 3, (i) => (i % 3 === 0 ? tuesday(i / 3) : {}));

  it('counts only finished sessions: a planned or unavailable Tuesday is neither skipped nor done', () => {
    const statuses = ['skipped', 'skipped', 'skipped', 'completed', 'planned', 'unavailable'];
    const history = withTuesdays(6, (w) => ({ status: statuses[w], body: null, mind: null }));
    expect(familyOf(detect(history), 'schedule')).toEqual([
      expect.objectContaining({ subject: 'Tuesday', numbers: { skipped: 3, of: 4 }, strength: 3, sample: 4 }),
    ]);
  });

  it('three skipped of five finished is most of them; three of six is not', () => {
    const fiveDone = withTuesdays(6, (w) => ({ status: w < 3 ? 'skipped' : w < 5 ? 'completed' : 'planned', body: null, mind: null }));
    expect(familyOf(detect(fiveDone), 'schedule')).toEqual([
      expect.objectContaining({ subject: 'Tuesday', numbers: { skipped: 3, of: 5 } }),
    ]);
    const sixDone = withTuesdays(6, (w) => ({ status: w < 3 ? 'skipped' : 'completed', body: null, mind: null }));
    expect(familyOf(detect(sixDone), 'schedule')).toEqual([]);
  });

  it('counts moves per weekday they left, and only a weekday with three', () => {
    const moves = [
      ...[2, 3, 4].map((w) => ({ from: addDays(mondayOf(w), 1), to: addDays(mondayOf(w), 2), by: 'athlete' })),
      { from: addDays(mondayOf(2), 3), to: addDays(mondayOf(2), 4), by: 'athlete' },
    ];
    expect(familyOf(detect(weeks(4, 3), moves), 'schedule')).toEqual([
      { family: 'schedule', subject: 'Tuesday', direction: null, numbers: { moved: 3 }, sample: 3, strength: 3, section: 'always' },
    ]);
  });
});

describe('boundaries: effort drift', () => {
  const run = (over: Partial<PatternSession>) => ({ sport: 'running', duration: 50, ...over });

  it('a session exactly a fifth longer than usual is still similar', () => {
    // Eight runs of 50 minutes at 140, then four of 60 minutes at 156.
    const history = weeks(6, 2, (i) => run(i < 8 ? { avgHr: 140 } : { duration: 60, avgHr: 156 }));
    expect(familyOf(detect(history), 'effort-drift')).toEqual([
      expect.objectContaining({ subject: 'running', metric: 'heart rate', direction: 'up', numbers: { baseline: 140, recent: 156 } }),
    ]);
  });

  it('finds the usual duration from the sessions that have one', () => {
    // Six runs carry no duration; the usual is still the other runs' 50 minutes.
    const history = weeks(6, 3, (i) =>
      i % 3 === 2 ? run({ duration: null, avgHr: 150 }) : run({ avgHr: i < 12 ? 140 : 156 }),
    );
    expect(familyOf(detect(history), 'effort-drift').map((p) => p.metric)).toEqual(['heart rate']);
  });

  it('the recent window starts on the Monday two weeks back, and two sessions there are enough', () => {
    // Recent: that Monday and the Tuesday after it; the rest of those weeks unrecorded.
    const history = weeks(6, 4, (i) => {
      if (i < 16) return run({ avgHr: 140 });
      return i === 16 || i === 19 ? run({ avgHr: 156 }) : run({ avgHr: null });
    });
    expect(familyOf(detect(history), 'effort-drift')).toEqual([
      expect.objectContaining({ numbers: { baseline: 140, recent: 156 }, sample: 18 }),
    ]);
  });

  it('needs three earlier sessions to compare with', () => {
    const three = weeks(4, 2, (i) => run(i < 3 ? { avgHr: 140 } : i < 4 ? { avgHr: null } : { avgHr: 156 }));
    expect(familyOf(detect(three), 'effort-drift').length).toBe(1);
    const two = weeks(4, 2, (i) => run(i < 2 ? { avgHr: 140 } : i < 4 ? { avgHr: null } : { avgHr: 156 }));
    expect(familyOf(detect(two), 'effort-drift')).toEqual([]);
  });

  it('reads pace only where a distance was recorded', () => {
    // Distances stop being recorded for the last two weeks: there is nothing recent to compare.
    const history = weeks(6, 2, (i) => run({ distanceM: i < 8 ? 10000 : null }));
    expect(familyOf(detect(history), 'effort-drift')).toEqual([]);
  });

  it('reads only completed sessions, and keeps each sport to itself', () => {
    const history = [
      ...weeks(6, 2, () => run({ avgHr: 140 })),
      // Two skipped runs carrying a high heart rate, and two hard rides: neither is a run.
      ...[0, 2].map((d) => s(addDays(mondayOf(1), d), run({ status: 'skipped', body: null, mind: null, avgHr: 175 }))),
      ...[4, 6].map((d) => s(addDays(mondayOf(1), d), { sport: 'cycling', duration: 50, avgHr: 175 })),
    ];
    expect(familyOf(detect(history), 'effort-drift')).toEqual([]);
  });
});

describe('boundaries: pairing a session with the one before it', () => {
  it('pairs by date, whatever order the sessions arrived in', () => {
    const history = weeks(4, 4, (i) =>
      i % 4 === 1 ? { body: 1 } : i % 4 === 2 ? { status: 'skipped', body: null, mind: null } : {},
    ).reverse();
    expect(familyOf(detect(history), 'body-push-back')).toEqual([
      { family: 'body-push-back', subject: 'body', direction: null, numbers: { pairs: 4 }, sample: 4, strength: 4, section: 'reports' },
    ]);
  });

  it('a skip after an unrated session, or a completed session after a low one, is not push-back', () => {
    const history = weeks(4, 4, (i) => {
      if (i % 4 === 1) return { body: null, mind: null };
      if (i % 4 === 2) return { status: 'skipped', body: null, mind: null };
      if (i % 4 === 3) return { body: 1 };
      return {};
    });
    expect(familyOf(detect(history), 'body-push-back')).toEqual([]);
  });

  it('a Body well above normal is not low, and neither is one at it', () => {
    const above = weeks(4, 4, (i) => (i % 4 === 0 ? { type: 'Intensity', body: 3 } : i % 4 === 1 ? { body: 5 } : { body: 3 }));
    expect(familyOf(detect(above), 'low-body-after-intensity')).toEqual([]);
    const at = weeks(4, 4, (i) => (i % 4 === 0 ? { type: 'Intensity' } : {}));
    expect(familyOf(detect(at), 'low-body-after-intensity')).toEqual([]);
  });

  it('judges low against rated sessions only, never the unrated ones', () => {
    // Per week: Intensity 5, then 3, then 5, and two unrated. Rated median 5: the 3 is low.
    const history = weeks(4, 5, (i) => {
      const k = i % 5;
      if (k === 0) return { type: 'Intensity', body: 5 };
      if (k === 1) return { body: 3 };
      if (k === 2) return { body: 5 };
      return { body: null, mind: null };
    });
    expect(familyOf(detect(history), 'low-body-after-intensity')).toEqual([
      { family: 'low-body-after-intensity', subject: 'Intensity', direction: null, numbers: { times: 4 }, sample: 4, strength: 4, section: 'reports' },
    ]);
  });

  it('only the session right after an Intensity one, and only a rated one', () => {
    const notIntensity = weeks(4, 4, (i) => (i % 4 === 1 ? { body: 1 } : {}));
    expect(familyOf(detect(notIntensity), 'low-body-after-intensity')).toEqual([]);
    const unrated = weeks(4, 4, (i) => (i % 4 === 0 ? { type: 'Intensity' } : i % 4 === 1 ? { body: null, mind: null } : {}));
    expect(familyOf(detect(unrated), 'low-body-after-intensity')).toEqual([]);
  });
});

describe('boundaries: the dormant rules', () => {
  const all = { type: 'Intensity', sleepHours: 5, restingPulse: 70, pushedBack: true, mind: 1 };
  const dormant = (over: Partial<PatternSession>) =>
    detect(weeks(4, 4, () => ({ ...all, ...over }))).filter((p) =>
      ['sleep-intensity', 'pulse-push-back', 'sleep-mind'].includes(p.family),
    );

  it('report what they rest on', () => {
    expect(dormant({})).toEqual([
      { family: 'sleep-intensity', subject: 'sleep', direction: null, numbers: { times: 16 }, sample: 16, strength: 16, section: 'reports' },
      { family: 'pulse-push-back', subject: 'resting pulse', direction: null, numbers: { times: 16 }, sample: 16, strength: 16, section: 'reports' },
      { family: 'sleep-mind', subject: 'sleep', direction: null, numbers: { times: 16 }, sample: 16, strength: 16, section: 'reports' },
    ]);
  });

  it('a night of exactly six hours is not short for intensity; exactly 6.5 is not short for mood', () => {
    expect(dormant({ sleepHours: 6 }).map((p) => p.family)).toEqual(['pulse-push-back', 'sleep-mind']);
    expect(dormant({ sleepHours: 6.5 }).map((p) => p.family)).toEqual(['pulse-push-back']);
  });

  it('a resting pulse of exactly 65 is raised; 64 is not', () => {
    expect(dormant({ restingPulse: 65 }).map((p) => p.family)).toContain('pulse-push-back');
    expect(dormant({ restingPulse: 64 }).map((p) => p.family)).not.toContain('pulse-push-back');
  });

  it('a Mind of exactly 2 is low; 3 is not', () => {
    expect(dormant({ mind: 2 }).map((p) => p.family)).toContain('sleep-mind');
    expect(dormant({ mind: 3 }).map((p) => p.family)).not.toContain('sleep-mind');
  });

  it('each needs every one of its fields', () => {
    expect(dormant({ type: 'Endurance' }).map((p) => p.family)).toEqual(['pulse-push-back', 'sleep-mind']);
    expect(dormant({ pushedBack: false }).map((p) => p.family)).toEqual(['sleep-mind']);
    expect(dormant({ sleepHours: undefined }).map((p) => p.family)).toEqual(['pulse-push-back']);
    expect(dormant({ restingPulse: undefined }).map((p) => p.family)).toEqual(['sleep-intensity', 'sleep-mind']);
    expect(dormant({ mind: null }).map((p) => p.family)).toEqual(['sleep-intensity', 'pulse-push-back']);
  });
});

describe('a steady athlete', () => {
  /** Mixed types and sports, steady ratings and effort, a few scattered skips and moves. */
  const steady = (n: number) =>
    weeks(n, 4, (i) => ({
      type: ['Endurance', 'Intensity', 'Recovery', 'Endurance'][i % 4],
      sport: i % 2 === 0 ? 'running' : 'cycling',
      duration: 50,
      avgHr: 140 + (i % 3),
      distanceM: 10000 + (i % 3) * 100,
      body: [3, 4, 5][i % 3],
      mind: [4, 3, 5][i % 3],
      ...(i === 5 || i === 14 ? { status: 'skipped', body: null, mind: null } : {}),
    }));
  const someMoves = [
    { from: addDays(mondayOf(3), 1), to: addDays(mondayOf(3), 2), by: 'athlete' },
    { from: addDays(mondayOf(2), 3), to: addDays(mondayOf(2), 4), by: 'athlete' },
  ];

  it('has no patterns at all, through last week', () => {
    expect(detect(steady(6), someMoves)).toEqual([]);
  });

  it('has none either when the history stops two weeks ago', () => {
    const older = steady(8).filter((x) => x.date < mondayOf(2));
    expect(detect(older, someMoves)).toEqual([]);
  });
});

describe('boundaries, second pass', () => {
  it('five rated sessions spread over four weeks are not enough', () => {
    // Only Thursdays and one Saturday are rated; every Tuesday skipped would otherwise be a pattern.
    const history = weeks(4, 3, (i) =>
      i % 3 === 1 || i === 2 ? {} : { status: i % 3 === 0 ? 'skipped' : 'completed', body: null, mind: null },
    );
    expect(detect(history)).toEqual([]);
  });

  it('a session on the first day of the recent week counts as recent only', () => {
    // Baseline alternates 4 and 3 (median 3.5); last week Monday and Tuesday are rated 1.
    const history = weeks(4, 4, (i) => {
      if (i < 12) return { body: i % 2 === 0 ? 4 : 3 };
      return i === 12 || i === 15 ? { body: 1 } : { status: 'skipped', body: null, mind: null };
    });
    expect(familyOf(detect(history), 'shift')).toEqual([
      expect.objectContaining({ subject: 'body', numbers: { baseline: 3.5, recent: 1 } }),
    ]);
  });

  it('two skipped of three is most of them, but under three is not a pattern', () => {
    const history = weeks(3, 3, (i) => (i === 0 || i === 3 ? { status: 'skipped', body: null, mind: null } : {}));
    expect(familyOf(detect(history), 'schedule')).toEqual([]);
  });

  it('pace is distance over time', () => {
    const history = weeks(6, 2, (i) => ({ sport: 'running', duration: 50, distanceM: i < 8 ? 10000 : 8000 }));
    expect(familyOf(detect(history), 'effort-drift')).toEqual([
      expect.objectContaining({ metric: 'pace', direction: 'down', numbers: { baseline: 200, recent: 160 } }),
    ]);
  });

  it('finds the usual duration even when half the runs carry none', () => {
    const history = weeks(6, 4, (i) =>
      i % 2 === 1 ? { sport: 'running', duration: null } : { sport: 'running', duration: 50, avgHr: i < 16 ? 140 : 156 },
    );
    expect(familyOf(detect(history), 'effort-drift').map((p) => p.metric)).toEqual(['heart rate']);
  });

  it('effort: the first day of the recent window is recent only, and three earlier sessions are enough', () => {
    // Baseline 140, 140, 150 (median 140); the Monday two weeks back and the Tuesday after, 156.
    const hr: Record<number, number> = { 0: 140, 1: 140, 2: 150, 11: 156, 12: 156 };
    const history = weeks(4, 4, (i) => ({ sport: 'running', duration: 50, avgHr: hr[i] ?? null }));
    expect(familyOf(detect(history), 'effort-drift')).toEqual([
      expect.objectContaining({ numbers: { baseline: 140, recent: 156 }, sample: 5 }),
    ]);
  });

  it('one recent session is not enough to call effort drifting', () => {
    const hr: Record<number, number> = { 0: 140, 1: 140, 2: 150, 11: 156 };
    const history = weeks(4, 4, (i) => ({ sport: 'running', duration: 50, avgHr: hr[i] ?? null }));
    expect(familyOf(detect(history), 'effort-drift')).toEqual([]);
  });

  it('skipped runs and other sports never move a sport\'s effort', () => {
    const history = [
      ...weeks(6, 2, () => ({ sport: 'running', duration: 50, avgHr: 140 })),
      ...[0, 1, 2, 3].map((d) => s(addDays(mondayOf(1), d), { sport: 'running', duration: 50, avgHr: 175, status: 'skipped', body: null, mind: null })),
      ...[0, 1, 2, 3].map((d) => s(addDays(mondayOf(2), d), { sport: 'cycling', duration: 50, avgHr: 175 })),
    ];
    expect(familyOf(detect(history), 'effort-drift')).toEqual([]);
  });
});
