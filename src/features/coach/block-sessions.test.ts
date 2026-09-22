import { describe, it, expect } from 'vitest';
import { wholeWeekWindow } from './week-draft';
import { addDays, weekStartOf } from '@/lib/date';
import { trainingBlocks } from './training-blocks';
import { blockSessions, isoWeekOdd, sessionsPerWeek, weekFactor, weekSessions, weeksToFill } from './block-sessions';

/**
 * `training-architecture/34` — the arithmetic fills a week with real sessions.
 * Pure: hours and a window in, rows out. Every number here is a decision from
 * the plan (D2–D10); changing one is one constant and one assertion.
 */
describe('sessionsPerWeek — how many sessions the hours buy (D2)', () => {
  it.each([
    [1, 3],
    [3, 3],
    [4, 3],
    [5, 4],
    [8, 6],
    [10, 7],
    [20, 7],
  ])('%i h/week → %i sessions', (hours, count) => {
    expect(sessionsPerWeek(hours)).toBe(count);
  });
});

describe('weekFactor — how much of the athlete’s hours a week carries (D4–D6)', () => {
  const base = { purpose: 'base' as const, daysToRace: 100 };

  it('ramps 0.85 → 1.0 across a 4-week block and deloads the last week to 0.6', () => {
    expect([1, 2, 3, 4].map((weekIndex) => weekFactor({ ...base, weekIndex, weeksInBlock: 4 }))).toEqual([
      0.85, 0.925, 1, 0.6,
    ]);
  });

  it('three weeks is the shortest block that waves: it ramps, then deloads', () => {
    // The boundary the wave starts at. Two weeks is flat, three is not.
    expect([1, 2, 3].map((weekIndex) => weekFactor({ ...base, weekIndex, weeksInBlock: 3 }))).toEqual([
      0.85, 1, 0.6,
    ]);
  });

  it('a block of one or two weeks has no room to wave, so every week is full', () => {
    expect([1, 2].map((weekIndex) => weekFactor({ ...base, weekIndex, weeksInBlock: 2 }))).toEqual([1, 1]);
    expect(weekFactor({ ...base, weekIndex: 1, weeksInBlock: 1 })).toBe(1);
  });

  it('build, peak and race weeks are flat at 1.0 — intensity rises instead of volume — but still deload last', () => {
    for (const purpose of ['build', 'peak', 'race'] as const) {
      expect(weekFactor({ purpose, weekIndex: 2, weeksInBlock: 4, daysToRace: 100 })).toBe(1);
      expect(weekFactor({ purpose, weekIndex: 4, weeksInBlock: 4, daysToRace: 100 })).toBe(0.6);
    }
  });

  it('the last two weeks before the race taper to 0.6 then 0.35, whatever the block says', () => {
    expect(weekFactor({ purpose: 'race', weekIndex: 3, weeksInBlock: 4, daysToRace: 10 })).toBe(0.6);
    expect(weekFactor({ purpose: 'race', weekIndex: 4, weeksInBlock: 4, daysToRace: 3 })).toBe(0.35);
    // 14 days out is still an ordinary week; 13 is the first taper week.
    expect(weekFactor({ purpose: 'base', weekIndex: 1, weeksInBlock: 4, daysToRace: 14 })).toBe(0.85);
    expect(weekFactor({ purpose: 'base', weekIndex: 1, weeksInBlock: 4, daysToRace: 13 })).toBe(0.6);
    expect(weekFactor({ purpose: 'base', weekIndex: 1, weeksInBlock: 4, daysToRace: 6 })).toBe(0.35);
  });
});

const MON = '2026-10-05'; // a Monday, ISO week 41 (odd)
const ARGS = {
  weekStart: MON,
  window: wholeWeekWindow(MON),
  purpose: 'base' as const,
  factor: 1,
  hours: 8,
  isoWeekOdd: true,
  deload: false,
};

describe('weekSessions — the week as rows (D7–D10)', () => {
  it('an 8 h base week places 6 sessions: Monday rests, the hard day Friday, the long ride Sunday', () => {
    // Six sessions out of seven plannable days, so one easy day goes — the
    // earliest (D8). The hard and long days are the week's shape and never the
    // ones dropped; `weekSkeleton` puts long on the last plannable day and
    // hard two days clear of it.
    const rows = weekSessions(ARGS);
    expect(rows.map((r) => [r.date, r.sport, r.type, r.durationMinutes, r.zone, r.title])).toEqual([
      ['2026-10-06', 'swim', 'Endurance', 66, 'Z2', 'Easy swim'],
      ['2026-10-07', 'run', 'Endurance', 66, 'Z2', 'Easy run'],
      ['2026-10-08', 'bike', 'Endurance', 66, 'Z2', 'Easy ride'],
      ['2026-10-09', 'run', 'Tempo', 72, 'Z3', 'Run tempo'],
      ['2026-10-10', 'swim', 'Endurance', 66, 'Z2', 'Easy swim'],
      ['2026-10-11', 'bike', 'Endurance', 144, 'Z2', 'Long ride'],
    ]);
    const minutes = rows.reduce((m, r) => m + (r.durationMinutes ?? 0), 0);
    expect(minutes).toBeGreaterThanOrEqual(8 * 60 * 0.9);
    expect(minutes).toBeLessThanOrEqual(8 * 60 * 1.1);
  });

  it('build weeks make the hard day Intensity/Z4; peak and race weeks make the long day a brick', () => {
    const hard = weekSessions({ ...ARGS, purpose: 'build' }).find((r) => r.type !== 'Endurance')!;
    expect([hard.type, hard.zone, hard.title]).toEqual(['Intensity', 'Z4', 'Run intervals']);
    for (const purpose of ['peak', 'race'] as const) {
      const long = weekSessions({ ...ARGS, purpose }).at(-1)!;
      expect([long.sport, long.title]).toEqual(['brick', 'Long brick']);
    }
  });

  it('names the hard day’s sport from the ISO week number itself, not merely alternately', () => {
    // 2026-10-05 is ISO week 41, odd, so the hard day is a run; the week after
    // is 42 and a ride. A wrong week number flips both.
    expect(weekSessions({ ...ARGS, isoWeekOdd: true }).find((r) => r.type === 'Tempo')?.sport).toBe('run');
    expect(weekSessions({ ...ARGS, isoWeekOdd: false }).find((r) => r.type === 'Tempo')?.sport).toBe('bike');
  });

  it('the hard day alternates run (odd ISO week) and bike (even)', () => {
    expect(weekSessions({ ...ARGS, isoWeekOdd: false }).find((r) => r.type === 'Tempo')).toMatchObject({
      sport: 'bike',
      title: 'Bike tempo',
    });
  });

  it('excluded days carry no session, and days beyond the session count become rest from Monday', () => {
    const rows = weekSessions({
      ...ARGS,
      hours: 4,
      window: wholeWeekWindow(MON, ['Wednesday']),
    });
    // 4 h buys three sessions; Wednesday is excluded, so the earliest easy
    // days drop until three remain — the long and hard days always survive.
    expect(rows.map((r) => r.date)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
    expect(rows.map((r) => r.type)).toEqual(['Tempo', 'Endurance', 'Endurance']);
  });

  it('the long day is always the week’s longest session, even when one easy day would otherwise take more', () => {
    // Three sessions out of 4 h: the easy share (55 %) would land on a single
    // day and beat the long day's 30 %. The surplus goes to the long day
    // instead, so "long" keeps meaning what it says.
    const rows = weekSessions({ ...ARGS, hours: 4, window: wholeWeekWindow(MON, ['Wednesday']) });
    const minutes = rows.map((r) => r.durationMinutes ?? 0);
    expect(Math.max(...minutes)).toBe(rows.at(-1)!.durationMinutes);
    expect(minutes.reduce((a, b) => a + b, 0)).toBe(4 * 60);
  });

  it('deload and taper weeks make the easy days Recovery/Z1 and keep the hard day off Intensity', () => {
    const rows = weekSessions({ ...ARGS, factor: 0.6, deload: true, purpose: 'build' });
    expect(rows.filter((r) => r.type === 'Recovery').every((r) => r.zone === 'Z1')).toBe(true);
    expect(rows.some((r) => r.type === 'Intensity')).toBe(false);
    expect(rows.some((r) => r.type === 'Tempo')).toBe(true);
  });

  it('never raises volume and intensity in the same week: a base week that ramps stays Tempo', () => {
    for (const factor of [0.85, 0.925, 1]) {
      expect(weekSessions({ ...ARGS, factor }).some((r) => r.type === 'Intensity')).toBe(false);
    }
  });

  it('keeps every session at or above the floor, and the long day at or above 45 minutes', () => {
    const rows = weekSessions({ ...ARGS, hours: 3, factor: 0.35 });
    expect(rows.every((r) => (r.durationMinutes ?? 0) >= 30)).toBe(true);
    expect(rows.at(-1)!.durationMinutes).toBeGreaterThanOrEqual(45);
  });

  it('a week with fewer than three plannable days gets easy days only — the skeleton’s own rule', () => {
    const rows = weekSessions({ ...ARGS, window: wholeWeekWindow(MON, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) });
    expect(rows.every((r) => r.type === 'Endurance')).toBe(true);
  });

  it('gives nothing for a week with no plannable day at all', () => {
    const rows = weekSessions({
      ...ARGS,
      window: wholeWeekWindow(MON, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
    });
    expect(rows).toEqual([]);
  });

  it('an easy-only week still spends the whole budget — there is no long or hard day to hold a share back', () => {
    // Under three plannable days the skeleton gives easy days only, so the 30 %
    // and 15 % shares have nobody to go to and the easy days take everything.
    const rows = weekSessions({
      ...ARGS,
      window: wholeWeekWindow(MON, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
    });
    expect(rows.map((r) => r.type)).toEqual(['Endurance', 'Endurance']);
    expect(rows.reduce((m, r) => m + (r.durationMinutes ?? 0), 0)).toBe(8 * 60);
  });

  it('is pure — the same arguments give the same rows', () => {
    expect(weekSessions(ARGS)).toEqual(weekSessions(ARGS));
  });
});

describe('isoWeekOdd — the week number the hard day alternates on (D8)', () => {
  it.each([
    ['2026-01-05', false], // ISO week 2
    ['2026-01-12', true], //  ISO week 3
    ['2026-10-05', true], //  ISO week 41
    ['2026-10-12', false], // ISO week 42
    ['2027-01-04', true], //  ISO week 1 — the count restarts with the year
    ['2028-01-03', true], //  ISO week 1 of a leap year that starts on a Saturday
  ])('%s is odd: %s', (weekStart, odd) => {
    expect(isoWeekOdd(weekStart)).toBe(odd);
  });
});

describe('blockSessions — a whole block as rows (D11)', () => {
  const BLOCK = {
    index: 4,
    total: 4,
    name: 'Race prep',
    startDate: '2026-10-05',
    endDate: '2026-11-01',
    authoredBy: 'arithmetic' as const,
  };
  const CTX = {
    raceDate: '2026-11-01',
    hours: 8,
    fixedConstraints: [] as string[],
    unavailableDates: [] as string[],
    firstDay: '2026-10-07',
  };

  it('fills every week the block covers, nothing before the first day, nothing on or after race day', () => {
    const rows = blockSessions(BLOCK, CTX);
    expect(rows.every((r) => r.date >= '2026-10-07' && r.date < '2026-11-01')).toBe(true);
    expect([...new Set(rows.map((r) => weekStartOf(r.date)))]).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
  });

  it('gives each week the factor its place in the block says, to the minute', () => {
    // The week's own factor, not a shared one: a wrong `weekIndex` or a dropped
    // argument shows up as the wrong number of minutes here.
    // Far from race day, so the taper has no say and the block's own wave shows.
    const rows = blockSessions({ ...BLOCK, index: 1, total: 4 }, { ...CTX, raceDate: '2027-03-01' });
    const week = (start: string) =>
      rows.filter((r) => weekStartOf(r.date) === start).reduce((m, r) => m + (r.durationMinutes ?? 0), 0);
    // A base block ramps 0.85 → 1.0 across its first three weeks, then deloads.
    expect(week('2026-10-12')).toBe(Math.round(8 * 60 * 0.925));
    expect(week('2026-10-19')).toBe(8 * 60);
  });

  it('marks the deload week by dropping its easy days to Recovery, and leaves the full weeks alone', () => {
    const rows = blockSessions({ ...BLOCK, index: 1, total: 4 }, { ...CTX, raceDate: '2027-03-01' });
    const types = (start: string) => rows.filter((r) => weekStartOf(r.date) === start).map((r) => r.type);
    expect(types('2026-10-19')).toContain('Endurance');
    expect(types('2026-10-19')).not.toContain('Recovery');
    expect(types('2026-10-26')).toContain('Recovery');
  });

  it('keeps a session that falls on the first day itself', () => {
    // 2026-10-07 is a Wednesday and plannable, so the day the fill starts on
    // carries a session rather than being the first one dropped.
    expect(blockSessions(BLOCK, CTX).some((r) => r.date === '2026-10-07')).toBe(true);
  });

  it('covers a block whose last day is a Monday, that week included', () => {
    const rows = blockSessions({ ...BLOCK, endDate: '2026-11-02' }, { ...CTX, raceDate: '2026-11-09' });
    expect([...new Set(rows.map((r) => weekStartOf(r.date)))]).toContain('2026-11-02');
  });

  it('tapers into race day: the last week before it carries far less than a full week', () => {
    const rows = blockSessions(BLOCK, CTX);
    const week = (start: string) =>
      rows.filter((r) => weekStartOf(r.date) === start).reduce((m, r) => m + (r.durationMinutes ?? 0), 0);
    expect(week('2026-10-26')).toBeLessThan(week('2026-10-12'));
    expect(week('2026-10-26')).toBeLessThanOrEqual(8 * 60 * 0.35 + 60);
  });

  it('starts at the block, not at the first day, when the block begins later', () => {
    const rows = blockSessions({ ...BLOCK, startDate: '2026-10-12' }, { ...CTX, firstDay: '2026-10-07' });
    expect(rows.every((r) => r.date >= '2026-10-12')).toBe(true);
    expect([...new Set(rows.map((r) => weekStartOf(r.date)))]).toEqual([
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
  });

  it('alternates the hard day between run and bike from one week to the next', () => {
    // The ISO week number's parity (D8), so two consecutive weeks never give the
    // same discipline the hard session twice.
    const rows = blockSessions(BLOCK, CTX);
    const hardSports = ['2026-10-12', '2026-10-19'].map(
      (week) => rows.find((r) => weekStartOf(r.date) === week && r.type !== 'Endurance' && r.type !== 'Recovery')?.sport,
    );
    expect(hardSports[0]).not.toBe(hardSports[1]);
    expect(new Set(hardSports)).toEqual(new Set(['run', 'bike']));
  });

  it('leaves excluded days alone across every week', () => {
    const rows = blockSessions(BLOCK, { ...CTX, fixedConstraints: ['Wednesday'] });
    expect(rows.some((r) => new Date(`${r.date}T00:00:00Z`).getUTCDay() === 3)).toBe(false);
  });

  it('gives an athlete with no plannable days nothing, and never throws', () => {
    const rows = blockSessions(BLOCK, {
      ...CTX,
      fixedConstraints: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    });
    expect(rows).toEqual([]);
  });
});

describe('weeksToFill — which weeks the structure owes the calendar (D11)', () => {
  const blocks = trainingBlocks('2026-10-05', '2027-01-31');

  it('lists every week of the current block that holds no planned session', () => {
    const due = weeksToFill({ today: '2026-10-07', blocks, plannedWeeks: new Set(['2026-10-12']) });
    expect(due.map((d) => d.weekStart)).not.toContain('2026-10-12');
    expect(due.every((d) => d.block.index === 1)).toBe(true);
    expect(due.length).toBeGreaterThan(0);
  });

  it('adds the next block’s weeks when 14 days or fewer of the current one remain', () => {
    const near = addDays(blocks[0].endDate, -14);
    expect(new Set(weeksToFill({ today: near, blocks, plannedWeeks: new Set() }).map((d) => d.block.index))).toEqual(
      new Set([1, 2]),
    );
    const far = addDays(blocks[0].endDate, -15);
    expect(new Set(weeksToFill({ today: far, blocks, plannedWeeks: new Set() }).map((d) => d.block.index))).toEqual(
      new Set([1]),
    );
  });

  it('never owes a week before today, and the next block’s weeks start at the block', () => {
    const near = addDays(blocks[0].endDate, -14);
    const due = weeksToFill({ today: near, blocks, plannedWeeks: new Set() });
    expect(due.every((d) => d.weekStart >= weekStartOf(near))).toBe(true);
    const nextBlockWeeks = due.filter((d) => d.block.index === 2).map((d) => d.weekStart);
    expect(nextBlockWeeks[0]).toBe(weekStartOf(blocks[1].startDate));
  });

  it('counts the block’s first and last day as inside it, and the day either side as outside', () => {
    const inside = (today: string) => weeksToFill({ today, blocks, plannedWeeks: new Set() }).length > 0;
    expect(inside(blocks[0].startDate)).toBe(true);
    expect(inside(blocks.at(-1)!.endDate)).toBe(true);
    expect(inside(addDays(blocks[0].startDate, -1))).toBe(false);
    expect(inside(addDays(blocks.at(-1)!.endDate, 1))).toBe(false);
  });

  it('is empty with no blocks, when every week is already planned, and after the race', () => {
    expect(weeksToFill({ today: '2026-10-07', blocks: [], plannedWeeks: new Set() })).toEqual([]);
    const all = new Set(weeksToFill({ today: '2026-10-07', blocks, plannedWeeks: new Set() }).map((d) => d.weekStart));
    expect(weeksToFill({ today: '2026-10-07', blocks, plannedWeeks: all })).toEqual([]);
    expect(weeksToFill({ today: '2027-02-05', blocks, plannedWeeks: new Set() })).toEqual([]);
  });
});
