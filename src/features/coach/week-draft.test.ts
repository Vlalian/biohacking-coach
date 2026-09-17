import { describe, it, expect } from 'vitest';
import { addDays } from '@/lib/date';
import {
  cycleAnchor,
  wholeWeekWindow,
  draftDueWeek,
  visibleTo,
  nextWeekWindow,
  pendingWeekDraft,
  weekSkeleton,
  weekWindow,
  WEEK_DRAFT_EVENT,
  type SkeletonDay,
} from './week-draft';

// 2026-09-14 is a Monday.
const MON = '2026-09-14';
const NEXT_MON = '2026-09-21';

describe('nextWeekWindow / weekWindow — the week after today, bounded and resolved', () => {
  it('spans Monday to Sunday of the following week with the excluded days resolved', () => {
    const w = nextWeekWindow('2026-09-16', ['Thursday'], ['2026-09-26']);
    expect(w).toEqual({
      start: NEXT_MON,
      end: '2026-09-27',
      excludedDates: ['2026-09-24', '2026-09-26'],
      fellThrough: false,
    });
  });

  it('is null when every day of that week is excluded', () => {
    const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    expect(nextWeekWindow('2026-09-16', allDays, [])).toBeNull();
  });

  it('weekWindow for the current week starts today, not Monday — the past is not plannable', () => {
    const w = weekWindow(MON, '2026-09-16', [], []);
    expect(w).toMatchObject({ start: '2026-09-16', end: '2026-09-20' });
  });

  it('weekWindow for a future week starts on its Monday', () => {
    expect(weekWindow(NEXT_MON, '2026-09-16', [], [])).toMatchObject({ start: NEXT_MON, end: '2026-09-27' });
  });

  it('with no constraints given at all, nothing is excluded', () => {
    expect(nextWeekWindow('2026-09-16')).toEqual({ start: NEXT_MON, end: '2026-09-27', excludedDates: [], fellThrough: false });
    expect(weekWindow(NEXT_MON, '2026-09-16')).toEqual({ start: NEXT_MON, end: '2026-09-27', excludedDates: [], fellThrough: false });
  });
});

describe('draftDueWeek — which week the Coach should be drafting today', () => {
  it('on the Weekly Session Day, the week after this one is due', () => {
    expect(draftDueWeek('2026-09-16', 'Wednesday')).toBe(NEXT_MON);
  });

  it('on the days after it in the same cycle, the same week stays due', () => {
    expect(draftDueWeek('2026-09-19', 'Wednesday')).toBe(NEXT_MON);
    expect(draftDueWeek('2026-09-22', 'Wednesday')).toBe(NEXT_MON);
  });

  it('before this week’s day, the previous cycle is still the current one — this week', () => {
    // Monday before a Wednesday day: the last Wednesday was last week, so the
    // week it drafted for is this one. Whether anything is *done* about it is
    // the gate's question (already drafted, already held) — not this one's.
    expect(draftDueWeek(MON, 'Wednesday')).toBe(MON);
  });

  it('Flexible and unset read as Sunday', () => {
    // Sunday 2026-09-20: the cycle anchored on that Sunday drafts the week after.
    expect(draftDueWeek('2026-09-20', 'Flexible')).toBe(NEXT_MON);
    expect(draftDueWeek('2026-09-20', null)).toBe(NEXT_MON);
    expect(draftDueWeek('2026-09-20', undefined)).toBe(NEXT_MON);
    // Saturday: the last Sunday was the 13th → that cycle drafts this week.
    expect(draftDueWeek('2026-09-19', 'Flexible')).toBe(MON);
  });

  it('anchors on the athlete’s own weekday, whichever of the seven it is', () => {
    // 2026-09-14..20 are Monday..Sunday. On the day itself, the week after is due;
    // the day before, the previous cycle's week (this one) is.
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    days.forEach((day, i) => {
      const date = addDays(MON, i);
      expect(draftDueWeek(date, day)).toBe(NEXT_MON);
      if (i > 0) expect(draftDueWeek(addDays(date, -1), day)).toBe(MON);
    });
  });

  it('leadDays = 1 makes the cycle due one day earlier', () => {
    // A Head Coach sees the draft the day before the athlete's Monday: on the
    // Sunday before, the Monday cycle is already the current one.
    expect(draftDueWeek('2026-09-20', 'Monday', 1)).toBe('2026-09-28');
    expect(draftDueWeek('2026-09-20', 'Monday', 0)).toBe(NEXT_MON);
  });
});

describe('pendingWeekDraft — the latest unresolved draft for a week', () => {
  const at = (n: number) => new Date(2026, 8, 1, 12, n);
  const drafted = (id: string, weekStart: string, n: number) => ({
    id,
    type: WEEK_DRAFT_EVENT.drafted,
    payload: { weekStart, visibleFrom: weekStart, sessions: [], citations: [] },
    createdAt: at(n),
  });
  const resolve = (type: string, weekStart: string, n: number) => ({
    id: `r-${n}`,
    type,
    payload: { weekStart },
    createdAt: at(n),
  });

  it('returns the draft when nothing resolved it', () => {
    const p = pendingWeekDraft([drafted('d1', NEXT_MON, 1)], NEXT_MON);
    expect(p).toMatchObject({ id: 'd1', weekStart: NEXT_MON });
  });

  it('a later written, declined or withdrawn event for the same week resolves it', () => {
    for (const type of ['week_plan_written', 'week_plan_declined', WEEK_DRAFT_EVENT.withdrawn]) {
      expect(pendingWeekDraft([drafted('d1', NEXT_MON, 1), resolve(type, NEXT_MON, 2)], NEXT_MON)).toBeNull();
    }
  });

  it('a newer draft supersedes an older one', () => {
    const p = pendingWeekDraft([drafted('d1', NEXT_MON, 1), drafted('d2', NEXT_MON, 2)], NEXT_MON);
    expect(p?.id).toBe('d2');
  });

  it('a resolving event with no readable week resolves nothing', () => {
    const events = [
      drafted('d1', NEXT_MON, 1),
      { id: 'r', type: 'week_plan_written', payload: 'gone', createdAt: at(2) },
      { id: 'r2', type: 'week_plan_written', payload: { weekStart: 5 }, createdAt: at(3) },
    ];
    expect(pendingWeekDraft(events, NEXT_MON)?.id).toBe('d1');
  });

  it('a resolution before the draft does not resolve it, and another week’s events are ignored', () => {
    const p = pendingWeekDraft(
      [resolve('week_plan_declined', NEXT_MON, 1), drafted('d1', NEXT_MON, 2), resolve('week_plan_written', MON, 3)],
      NEXT_MON,
    );
    expect(p?.id).toBe('d1');
  });

  it('ignores a malformed payload rather than throwing', () => {
    expect(pendingWeekDraft([{ id: 'x', type: WEEK_DRAFT_EVENT.drafted, payload: null, createdAt: at(1) }], NEXT_MON)).toBeNull();
    // A week without a session list is not a draft; the older good one stands.
    const bad = { id: 'y', type: WEEK_DRAFT_EVENT.drafted, payload: { weekStart: NEXT_MON, sessions: 'three' }, createdAt: at(3) };
    expect(pendingWeekDraft([drafted('d1', NEXT_MON, 1), bad], NEXT_MON)?.id).toBe('d1');
  });

  it('reads the optional fields leniently: visibleFrom falls back to the week, citations to none', () => {
    const p = pendingWeekDraft(
      [{ id: 'd', type: WEEK_DRAFT_EVENT.drafted, payload: { weekStart: NEXT_MON, sessions: [], citations: 'n/a' }, createdAt: at(1) }],
      NEXT_MON,
    );
    expect(p).toMatchObject({ visibleFrom: NEXT_MON, citations: [] });
    const q = pendingWeekDraft(
      [{ id: 'd', type: WEEK_DRAFT_EVENT.drafted, payload: { weekStart: NEXT_MON, visibleFrom: '2026-09-20', sessions: [], citations: [{ sourceId: 's' }] }, createdAt: at(1) }],
      NEXT_MON,
    );
    expect(q).toMatchObject({ visibleFrom: '2026-09-20', citations: [{ sourceId: 's' }] });
  });
});

describe('weekSkeleton — the default week the Coach adjusts', () => {
  const window = (excluded: string[]) => ({
    start: NEXT_MON,
    end: '2026-09-27',
    excludedDates: excluded,
    fellThrough: false,
  });
  const roles = (days: SkeletonDay[]) => days.map((d) => d.role);
  const dayAfter = (days: SkeletonDay[], role: SkeletonDay['role']) => {
    const i = days.findIndex((d) => d.role === role);
    return i >= 0 ? days[i + 1] : undefined;
  };

  it('a free week: long on Sunday, hard midweek, easy in between, nothing on no day', () => {
    const days = weekSkeleton(window([]));
    expect(days).toHaveLength(7);
    expect(days[6]).toEqual({ date: '2026-09-27', role: 'long' });
    expect(roles(days).filter((r) => r === 'long')).toHaveLength(1);
    expect(roles(days).filter((r) => r === 'hard')).toHaveLength(1);
    expect(roles(days)).not.toContain('rest');
  });

  it('excluded days are rest, and long lands on the last plannable weekend day', () => {
    const days = weekSkeleton(window(['2026-09-27']));
    expect(days[6].role).toBe('rest');
    expect(days[5].role).toBe('long');
  });

  it('a free week is exactly: easy, easy, easy, easy, hard, easy, long', () => {
    // Hard is the latest day at least two before long — Friday before Sunday.
    expect(roles(weekSkeleton(window([])))).toEqual(['easy', 'easy', 'easy', 'easy', 'hard', 'easy', 'long']);
  });

  it('three plannable days get a long and a hard; two get neither', () => {
    const three = weekSkeleton(window(['2026-09-22', '2026-09-24', '2026-09-26', '2026-09-27']));
    expect(roles(three)).toEqual(['easy', 'rest', 'hard', 'rest', 'long', 'rest', 'rest']);
    const two = weekSkeleton(window(['2026-09-21', '2026-09-22', '2026-09-24', '2026-09-26', '2026-09-27']));
    expect(roles(two)).toEqual(['rest', 'rest', 'easy', 'rest', 'easy', 'rest', 'rest']);
  });

  it('holds, over every exclusion mask: one long, at most one hard, hard ≥ 2 days before long, never hard the day after long, all easy when fewer than three days are plannable', () => {
    const all = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
    for (let mask = 0; mask < 128; mask++) {
      const excluded = all.filter((_, i) => mask & (1 << i));
      const days = weekSkeleton(window(excluded));
      const plannable = days.filter((d) => d.role !== 'rest');
      expect(days.filter((d) => d.role === 'rest').map((d) => d.date)).toEqual(excluded);
      if (plannable.length === 0) continue;
      if (plannable.length < 3) {
        expect(plannable.every((d) => d.role === 'easy')).toBe(true);
        continue;
      }
      const longs = days.filter((d) => d.role === 'long');
      const hards = days.filter((d) => d.role === 'hard');
      expect(longs).toHaveLength(1);
      expect(hards.length).toBeLessThanOrEqual(1);
      if (hards.length === 1) {
        const gap =
          (new Date(`${longs[0].date}T00:00:00Z`).getTime() - new Date(`${hards[0].date}T00:00:00Z`).getTime()) /
          86_400_000;
        expect(gap).toBeGreaterThanOrEqual(2);
      }
      const after = dayAfter(days, 'long');
      if (after) expect(after.role).not.toBe('hard');
    }
  });

  it('long is the last plannable weekend day, else the last plannable day of the week', () => {
    const days = weekSkeleton(window(['2026-09-26', '2026-09-27']));
    expect(days.find((d) => d.role === 'long')?.date).toBe('2026-09-25');
    expect(addDays('2026-09-25', 2)).toBe('2026-09-27');
  });
});

describe('cycleAnchor — the date of the day the current cycle turns on', () => {
  it('is the most recent Weekly Session Day on or before today, or one day later with a lead', () => {
    expect(cycleAnchor('2026-09-19', 'Wednesday')).toBe('2026-09-16');
    expect(cycleAnchor('2026-09-16', 'Wednesday')).toBe('2026-09-16');
    // With a one-day lead, the Tuesday before already belongs to Wednesday's cycle.
    expect(cycleAnchor('2026-09-15', 'Wednesday', 1)).toBe('2026-09-16');
    expect(cycleAnchor('2026-09-15', 'Wednesday')).toBe('2026-09-09');
  });
});

describe('visibleTo — the Head Coach’s day-early preview is the only reason the athlete cannot see a draft', () => {
  const draft = { id: 'd', weekStart: NEXT_MON, visibleFrom: '2026-09-17', sessions: [], citations: [], approved: false, createdAt: new Date() };
  it('hides the draft before its visibleFrom and shows it from that day on', () => {
    expect(visibleTo(draft, '2026-09-16')).toBe(false);
    expect(visibleTo(draft, '2026-09-17')).toBe(true);
    expect(visibleTo(draft, '2026-09-20')).toBe(true);
  });
});

describe('pendingWeekDraft — the Head Coach’s approved version (training-architecture/17)', () => {
  const at = (n: number) => new Date(2026, 8, 1, 12, n);
  const drafted = (id: string, n: number) => ({
    id,
    type: WEEK_DRAFT_EVENT.drafted,
    payload: { weekStart: NEXT_MON, visibleFrom: '2026-09-17', sessions: [{ date: '2026-09-22' }], citations: [] },
    createdAt: at(n),
  });
  const approved = (id: string, n: number) => ({
    id,
    type: WEEK_DRAFT_EVENT.approved,
    payload: { draftId: 'd1', weekStart: NEXT_MON, visibleFrom: '2026-09-17', sessions: [{ date: '2026-09-23' }], citations: [], changed: true },
    createdAt: at(n),
  });

  it('an approval replaces the draft it approves as the pending week, marked approved', () => {
    const p = pendingWeekDraft([drafted('d1', 1), approved('a1', 2)], NEXT_MON);
    expect(p).toMatchObject({ id: 'a1', approved: true, sessions: [{ date: '2026-09-23' }], visibleFrom: '2026-09-17' });
  });

  it('a later draft (a regeneration) supersedes the approval, and a decision resolves whichever is pending', () => {
    expect(pendingWeekDraft([drafted('d1', 1), approved('a1', 2), drafted('d2', 3)], NEXT_MON)).toMatchObject({ id: 'd2', approved: false });
    expect(pendingWeekDraft([drafted('d1', 1), approved('a1', 2), { id: 'w', type: 'week_plan_written', payload: { weekStart: NEXT_MON }, createdAt: at(3) }], NEXT_MON)).toBeNull();
  });
});

describe('wholeWeekWindow — the window a late acceptance validates against', () => {
  it('is Monday to Sunday whatever today is, with the excluded days resolved, and never null', () => {
    expect(wholeWeekWindow(NEXT_MON, ['Thursday'], ['2026-09-26'])).toEqual({
      start: NEXT_MON,
      end: '2026-09-27',
      excludedDates: ['2026-09-24', '2026-09-26'],
      fellThrough: false,
    });
    expect(wholeWeekWindow(NEXT_MON)).toEqual({ start: NEXT_MON, end: '2026-09-27', excludedDates: [], fellThrough: false });
  });
});
