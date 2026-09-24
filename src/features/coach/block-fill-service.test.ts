import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDays, weekStartOf } from '@/lib/date';

/**
 * `training-architecture/34` — the trigger that keeps the calendar full.
 * Every collaborator is mocked; what is proven here is the gate, the outcomes
 * and that a failure is reported rather than thrown at the page.
 */
const {
  getAthleteById,
  getResolvedBlocks,
  getSessionsForAthlete,
  getUnavailableDates,
  insertArithmeticSessions,
  replaceArithmeticWeeks,
  logCoachFailure,
} = vi.hoisted(() => ({
    getAthleteById: vi.fn(),
    getResolvedBlocks: vi.fn(),
    getSessionsForAthlete: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
    getUnavailableDates: vi.fn<() => Promise<string[]>>(() => Promise.resolve([])),
    insertArithmeticSessions: vi.fn<(athleteId: string, rows: { date: string; durationMinutes: number | null }[]) => Promise<void>>(
      () => Promise.resolve(),
    ),
    replaceArithmeticWeeks: vi.fn<
      (athleteId: string, weeks: string[], rows: { date: string; durationMinutes: number | null }[]) => Promise<void>
    >(() => Promise.resolve()),
    logCoachFailure: vi.fn(),
  }));

vi.mock('@/features/athlete/athlete-repository', () => ({ getAthleteById }));
vi.mock('./training-block-service', () => ({ getResolvedBlocks }));
vi.mock('@/features/session/session-repository', () => ({
  getSessionsForAthlete,
  insertArithmeticSessions,
  replaceArithmeticWeeks,
}));
vi.mock('@/features/availability/availability-repository', () => ({ getUnavailableDates }));
vi.mock('@/lib/coach-log', () => ({ logCoachFailure }));

const { ensureBlockFilled, previewRefill, refillWeeksFromHours } = await import('./block-fill-service');

const TODAY = '2026-10-07';
const RACE = '2027-01-31';

const athlete = (over: Record<string, unknown> = {}) => ({
  id: 'athlete_1',
  hoursPerWeek: 8,
  profile: { fixedConstraints: [] },
  ...over,
});

function blocksFrom(today: string, raceDate: string) {
  // The real arithmetic, so the weeks the gate lists are the weeks that exist.
  return import('./training-blocks').then((m) => m.trainingBlocks(today, raceDate));
}

beforeEach(async () => {
  vi.clearAllMocks();
  getAthleteById.mockResolvedValue(athlete());
  getSessionsForAthlete.mockResolvedValue([]);
  getUnavailableDates.mockResolvedValue([]);
  getResolvedBlocks.mockResolvedValue({
    race: { id: 'race_1', date: RACE },
    set: null,
    blocks: await blocksFrom(TODAY, RACE),
  });
});

describe('ensureBlockFilled', () => {
  it('fills every week of the current block for an athlete whose calendar is empty', async () => {
    expect(await ensureBlockFilled('athlete_1', TODAY)).toBe('filled');
    expect(insertArithmeticSessions).toHaveBeenCalledTimes(1);

    const [athleteId, rows] = insertArithmeticSessions.mock.calls[0];
    expect(athleteId).toBe('athlete_1');
    expect(rows.length).toBeGreaterThan(0);
    // Nothing before today, nothing on or after race day.
    expect(rows.every((r) => r.date >= TODAY && r.date < RACE)).toBe(true);
  });

  it('a second open changes nothing — the weeks it wrote are planned now', async () => {
    await ensureBlockFilled('athlete_1', TODAY);
    const written = (insertArithmeticSessions.mock.calls[0])[1];
    getSessionsForAthlete.mockResolvedValue(
      written.map((r) => ({ date: r.date, origin: 'arithmetic', status: 'planned' })),
    );
    insertArithmeticSessions.mockClear();

    expect(await ensureBlockFilled('athlete_1', TODAY)).toBe('nothing-due');
    expect(insertArithmeticSessions).not.toHaveBeenCalled();
  });

  it('leaves a week the Coach already planned alone', async () => {
    getSessionsForAthlete.mockResolvedValue([
      { date: '2026-10-14', origin: 'coach', status: 'planned' },
    ]);

    await ensureBlockFilled('athlete_1', TODAY);
    const rows = (insertArithmeticSessions.mock.calls[0])[1];
    expect(rows.some((r) => weekStartOf(r.date) === '2026-10-12')).toBe(false);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('counts only planned sessions as a reason to skip a week: a completed one does not hold it', async () => {
    getSessionsForAthlete.mockResolvedValue([
      { date: '2026-10-14', origin: 'coach', status: 'completed' },
      { date: '2026-10-15', origin: 'athlete', status: 'planned' },
    ]);

    await ensureBlockFilled('athlete_1', TODAY);
    const rows = (insertArithmeticSessions.mock.calls[0])[1];
    expect(rows.some((r) => weekStartOf(r.date) === '2026-10-12')).toBe(true);
  });

  it('a race with no blocks drawn yet is no-race too — there is no structure to fill', async () => {
    getResolvedBlocks.mockResolvedValue({ race: { id: 'race_1', date: RACE }, set: null, blocks: [] });
    expect(await ensureBlockFilled('athlete_1', TODAY)).toBe('no-race');
    expect(insertArithmeticSessions).not.toHaveBeenCalled();
  });

  it('a Head Coach’s week holds its week as surely as the Coach’s', async () => {
    getSessionsForAthlete.mockResolvedValue([
      { date: '2026-10-14', origin: 'head_coach', status: 'planned' },
    ]);

    await ensureBlockFilled('athlete_1', TODAY);
    const rows = (insertArithmeticSessions.mock.calls[0])[1];
    expect(rows.some((r) => weekStartOf(r.date) === '2026-10-12')).toBe(false);
  });

  it('stops at the gate when nothing is due — it does not go on to read the athlete’s days', async () => {
    getResolvedBlocks.mockResolvedValue({ race: { id: 'race_1', date: RACE }, set: null, blocks: [] });
    await ensureBlockFilled('athlete_1', TODAY);
    expect(getUnavailableDates).not.toHaveBeenCalled();
  });

  it('writes each owed week once, however many of them one block covers', async () => {
    await ensureBlockFilled('athlete_1', TODAY);
    const rows = (insertArithmeticSessions.mock.calls[0])[1];
    const dates = rows.map((r) => r.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(new Set(dates.map(weekStartOf)).size).toBeGreaterThan(1);
  });

  it('an athlete who has ruled out every day gets no sessions, and nothing is written', async () => {
    getAthleteById.mockResolvedValue(
      athlete({
        profile: {
          fixedConstraints: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        },
      }),
    );

    expect(await ensureBlockFilled('athlete_1', TODAY)).toBe('no-plannable-day');
    expect(insertArithmeticSessions).not.toHaveBeenCalled();
  });

  it('an athlete with no profile at all is planned for every day of the week', async () => {
    getAthleteById.mockResolvedValue({ id: 'athlete_1', hoursPerWeek: 8 });

    expect(await ensureBlockFilled('athlete_1', TODAY)).toBe('filled');
    const rows = (insertArithmeticSessions.mock.calls[0])[1];
    expect(rows.length).toBeGreaterThan(0);
  });

  it('hands the race distance to the arithmetic, so a long-distance week is spread over more days', async () => {
    // `training-architecture/34` ruling 3: the session count is floored by the
    // distance. Four hours buys three sessions on its own and six for a Full.
    getAthleteById.mockResolvedValue(athlete({ hoursPerWeek: 4 }));
    getResolvedBlocks.mockResolvedValue({
      race: { id: 'race_1', date: RACE, distance: 'Full' },
      set: null,
      blocks: await blocksFrom(TODAY, RACE),
    });

    await ensureBlockFilled('athlete_1', TODAY);
    const rows = (insertArithmeticSessions.mock.calls[0])[1];
    const firstWeek = rows.filter((r) => weekStartOf(r.date) === weekStartOf(TODAY));
    expect(firstWeek.length).toBeGreaterThanOrEqual(5);
  });

  it('plans on the hours alone when the stored distance is not one the app knows', async () => {
    getAthleteById.mockResolvedValue(athlete({ hoursPerWeek: 4 }));
    getResolvedBlocks.mockResolvedValue({
      race: { id: 'race_1', date: RACE, distance: 'Duathlon' },
      set: null,
      blocks: await blocksFrom(TODAY, RACE),
    });

    await ensureBlockFilled('athlete_1', TODAY);
    const rows = (insertArithmeticSessions.mock.calls[0])[1];
    expect(rows.filter((r) => weekStartOf(r.date) === weekStartOf(TODAY)).length).toBeLessThanOrEqual(4);
  });

  it('writes a week straddling a block boundary once, not once per block', async () => {
    // Within the lookahead, `weeksToFill` lists the next block's weeks too. A
    // block ends mid-week and the next starts the day after, so one Mon–Sun
    // week belongs to both — and without an owner each of its days would carry
    // two sessions (CodeRabbit, PR #98).
    const blocks = await blocksFrom(TODAY, RACE);
    const near = addDays(blocks[0].endDate, -14);
    getResolvedBlocks.mockResolvedValue({ race: { id: 'race_1', date: RACE }, set: null, blocks });

    await ensureBlockFilled('athlete_1', near);
    const rows = (insertArithmeticSessions.mock.calls[0])[1];
    const dates = rows.map((r) => r.date);
    expect(new Set(dates).size).toBe(dates.length);

    // And the block the athlete is still in draws it, not the one they are
    // about to enter. The shared week is block 1's last, so it is a deload;
    // block 2 would have drawn it flat at full hours.
    const shared = weekStartOf(blocks[1].startDate);
    expect(weekStartOf(blocks[0].endDate), 'the fixture must straddle a week').toBe(shared);
    const sharedMinutes = rows
      .filter((r) => weekStartOf(r.date) === shared)
      .reduce((m, r) => m + (r.durationMinutes ?? 0), 0);
    expect(sharedMinutes).toBeLessThan(8 * 60 * 0.8);
  });

  it('reports no-race, no-hours and a missing athlete without writing anything', async () => {
    getResolvedBlocks.mockResolvedValue({ race: null, set: null, blocks: [] });
    expect(await ensureBlockFilled('athlete_1', TODAY)).toBe('no-race');

    getResolvedBlocks.mockResolvedValue({ race: { id: 'race_1', date: RACE }, set: null, blocks: await blocksFrom(TODAY, RACE) });
    getAthleteById.mockResolvedValue(athlete({ hoursPerWeek: null }));
    expect(await ensureBlockFilled('athlete_1', TODAY)).toBe('no-hours');

    getAthleteById.mockResolvedValue(null);
    expect(await ensureBlockFilled('athlete_1', TODAY)).toBe('no-hours');

    expect(insertArithmeticSessions).not.toHaveBeenCalled();
  });

  it('never throws at the page: a dead read or a refused write is reported as failed and logged', async () => {
    getResolvedBlocks.mockRejectedValueOnce(new Error('driver down'));
    expect(await ensureBlockFilled('athlete_1', TODAY)).toBe('failed');
    expect(logCoachFailure).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'block_fill', athleteId: 'athlete_1' }),
    );

    insertArithmeticSessions.mockRejectedValueOnce(new Error('insert failed'));
    expect(await ensureBlockFilled('athlete_1', TODAY)).toBe('failed');
  });

  it('plans around the days the athlete cannot train', async () => {
    getAthleteById.mockResolvedValue(athlete({ profile: { fixedConstraints: ['Wednesday'] } }));
    getUnavailableDates.mockResolvedValue(['2026-10-15']);

    await ensureBlockFilled('athlete_1', TODAY);
    const rows = (insertArithmeticSessions.mock.calls[0])[1];
    expect(rows.some((r) => new Date(`${r.date}T00:00:00Z`).getUTCDay() === 3)).toBe(false);
    expect(rows.some((r) => r.date === '2026-10-15')).toBe(false);
  });
});

/**
 * `showable-version/40` — hours changed in Settings. The weeks the structure
 * still owns are redrawn from the new number; every other week is left to the
 * repository's guarded delete, which never reaches it.
 */
describe('refillWeeksFromHours', () => {
  const NEXT_WEEK = '2026-10-12';
  const NEXT_WEEK_WED = '2026-10-14';
  const WEEK_AFTER_WED = '2026-10-21';
  const minutes = (rows: { durationMinutes: number | null }[]) => rows.reduce((m, r) => m + (r.durationMinutes ?? 0), 0);

  async function sameWeekAt(hours: number) {
    const { blockSessions } = await import('./block-sessions');
    const blocks = await blocksFrom(TODAY, RACE);
    return blockSessions(blocks[0], { raceDate: RACE, hours, fixedConstraints: [], unavailableDates: [], firstDay: TODAY }).filter(
      (r) => weekStartOf(r.date) === NEXT_WEEK,
    );
  }

  it('redraws the eligible weeks with the new hours and leaves every other row alone', async () => {
    getAthleteById.mockResolvedValue(athlete({ hoursPerWeek: 12 }));
    getSessionsForAthlete.mockResolvedValue([
      { date: NEXT_WEEK_WED, origin: 'arithmetic', status: 'planned' },
      { date: WEEK_AFTER_WED, origin: 'coach', status: 'planned' },
    ]);

    expect(await refillWeeksFromHours('athlete_1', TODAY)).toEqual({ outcome: 'refilled', weeks: [NEXT_WEEK] });
    const [athleteId, weeks, rows] = replaceArithmeticWeeks.mock.calls[0];
    expect(athleteId).toBe('athlete_1');
    expect(weeks).toEqual([NEXT_WEEK]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => weekStartOf(r.date) === NEXT_WEEK)).toBe(true);
    // Drawn from 12 h: the same week drawn at 8 h holds less.
    expect(minutes(rows)).toBeGreaterThan(minutes(await sameWeekAt(8)));
    expect(rows).toEqual(await sameWeekAt(12));
  });

  it('draws a week straddling a block boundary once, not once per block', async () => {
    const blocks = await blocksFrom(TODAY, RACE);
    const shared = weekStartOf(blocks[1].startDate);
    getSessionsForAthlete.mockResolvedValue([{ date: addDays(shared, 1), origin: 'arithmetic', status: 'planned' }]);

    expect(await refillWeeksFromHours('athlete_1', TODAY)).toEqual({ outcome: 'refilled', weeks: [shared] });
    const rows = replaceArithmeticWeeks.mock.calls[0][2];
    const dates = rows.map((r) => r.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(rows.every((r) => weekStartOf(r.date) === shared)).toBe(true);
  });

  it('a block ending on a Monday draws that whole week — the fill’s owner rule', async () => {
    // The week of 2026-10-19 opens on block 1's last day, so block 1 owns it,
    // exactly as `weeksToFill` lists it under block 1 first.
    const block = (index: number, startDate: string, endDate: string) =>
      ({ index, total: 2, name: `Block ${index}`, startDate, endDate, authoredBy: 'arithmetic' }) as const;
    const blocks = [block(1, '2026-10-05', '2026-10-19'), block(2, '2026-10-20', RACE)];
    getResolvedBlocks.mockResolvedValue({ race: { id: 'race_1', date: RACE }, set: null, blocks });
    getSessionsForAthlete.mockResolvedValue([{ date: '2026-10-21', origin: 'arithmetic', status: 'planned' }]);

    await refillWeeksFromHours('athlete_1', TODAY);
    const { blockSessions } = await import('./block-sessions');
    const ctx = { raceDate: RACE, distance: null, hours: 8, fixedConstraints: [], unavailableDates: [], firstDay: TODAY };
    expect(replaceArithmeticWeeks.mock.calls[0][2]).toEqual(
      blockSessions(blocks[0], ctx).filter((r) => weekStartOf(r.date) === '2026-10-19'),
    );
  });

  it('an athlete with no profile at all is redrawn for every day of the week', async () => {
    getAthleteById.mockResolvedValue({ id: 'athlete_1', hoursPerWeek: 8 });
    getSessionsForAthlete.mockResolvedValue([{ date: NEXT_WEEK_WED, origin: 'arithmetic', status: 'planned' }]);

    expect(await refillWeeksFromHours('athlete_1', TODAY)).toEqual({ outcome: 'refilled', weeks: [NEXT_WEEK] });
  });

  it('plans around the days the athlete cannot train', async () => {
    getAthleteById.mockResolvedValue(athlete({ profile: { fixedConstraints: ['Wednesday'] } }));
    getUnavailableDates.mockResolvedValue(['2026-10-15']);
    getSessionsForAthlete.mockResolvedValue([{ date: NEXT_WEEK_WED, origin: 'arithmetic', status: 'planned' }]);

    await refillWeeksFromHours('athlete_1', TODAY);
    const rows = replaceArithmeticWeeks.mock.calls[0][2];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => new Date(`${r.date}T00:00:00Z`).getUTCDay() === 3)).toBe(false);
    expect(rows.some((r) => r.date === '2026-10-15')).toBe(false);
    expect(getUnavailableDates).toHaveBeenCalledWith('athlete_1');
  });

  it('writes nothing when no week is the structure’s to redraw', async () => {
    getSessionsForAthlete.mockResolvedValue([{ date: WEEK_AFTER_WED, origin: 'coach', status: 'planned' }]);

    expect(await refillWeeksFromHours('athlete_1', TODAY)).toEqual({ outcome: 'nothing-due', weeks: [] });
    expect(replaceArithmeticWeeks).not.toHaveBeenCalled();
  });

  it('reports no-race and no-hours without writing anything', async () => {
    getSessionsForAthlete.mockResolvedValue([{ date: NEXT_WEEK_WED, origin: 'arithmetic', status: 'planned' }]);
    getResolvedBlocks.mockResolvedValue({ race: null, set: null, blocks: [] });
    expect(await refillWeeksFromHours('athlete_1', TODAY)).toEqual({ outcome: 'no-race', weeks: [] });

    getResolvedBlocks.mockResolvedValue({ race: { id: 'race_1', date: RACE }, set: null, blocks: [] });
    expect(await refillWeeksFromHours('athlete_1', TODAY)).toEqual({ outcome: 'no-race', weeks: [] });

    getResolvedBlocks.mockResolvedValue({ race: { id: 'race_1', date: RACE }, set: null, blocks: await blocksFrom(TODAY, RACE) });
    getAthleteById.mockResolvedValue(athlete({ hoursPerWeek: null }));
    expect(await refillWeeksFromHours('athlete_1', TODAY)).toEqual({ outcome: 'no-hours', weeks: [] });

    getAthleteById.mockResolvedValue(null);
    expect(await refillWeeksFromHours('athlete_1', TODAY)).toEqual({ outcome: 'no-hours', weeks: [] });

    expect(replaceArithmeticWeeks).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    getSessionsForAthlete.mockRejectedValue(new Error('down'));

    expect(await refillWeeksFromHours('athlete_1', TODAY)).toEqual({ outcome: 'failed', weeks: [] });
    expect(logCoachFailure).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'block_fill', athleteId: 'athlete_1', conversationId: null }),
    );
  });
});

describe('previewRefill — what the confirmation names', () => {
  it('names the weeks a redraw would write, and writes nothing', async () => {
    getSessionsForAthlete.mockResolvedValue([
      { date: '2026-10-14', origin: 'arithmetic', status: 'planned' },
      { date: '2026-10-21', origin: 'coach', status: 'planned' },
      { date: '2026-10-28', origin: 'arithmetic', status: 'planned' },
    ]);

    expect(await previewRefill('athlete_1', TODAY)).toEqual(['2026-10-12', '2026-10-26']);
    expect(getResolvedBlocks).toHaveBeenCalledWith('athlete_1', TODAY);
    expect(getSessionsForAthlete).toHaveBeenCalledWith('athlete_1');
    expect(replaceArithmeticWeeks).not.toHaveBeenCalled();
    expect(insertArithmeticSessions).not.toHaveBeenCalled();
  });

  it('names a week straddling a block boundary once', async () => {
    const blocks = await blocksFrom(TODAY, RACE);
    const shared = weekStartOf(blocks[1].startDate);
    getSessionsForAthlete.mockResolvedValue([{ date: addDays(shared, 1), origin: 'arithmetic', status: 'planned' }]);

    expect(await previewRefill('athlete_1', TODAY)).toEqual([shared]);
  });

  it('names no week after the last block', async () => {
    const blocks = await blocksFrom(TODAY, RACE);
    const last = blocks[blocks.length - 1];
    getSessionsForAthlete.mockResolvedValue([
      { date: addDays(weekStartOf(last.endDate), 7), origin: 'arithmetic', status: 'planned' },
    ]);

    expect(await previewRefill('athlete_1', TODAY)).toEqual([]);
  });
});
