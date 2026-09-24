import { describe, it, expect, vi } from 'vitest';
import { coachSeesDay, commitDayChoice, commitDismissal, dayChoice, dayMessageKey, displayNameFor, nextDraftDates, raceFacts } from './weekly-session-day';
import { HEAD_COACH_LEAD_DAYS } from './week-draft';
import { trainingBlocks } from './training-blocks';

const TUE = '2026-09-22'; // a Tuesday

describe('nextDraftDates — the next planning day, the coach’s day before, the week it covers', () => {
  it('on the coach lead day, the athlete sees the draft tomorrow and the coach today', () => {
    expect(nextDraftDates(TUE, 'Wednesday')).toEqual({
      athleteSees: '2026-09-23',
      coachSees: '2026-09-22',
      weekStart: '2026-09-23',
      weekEnd: '2026-09-29',
    });
  });

  it('on the planning day itself, next means a week on', () => {
    expect(nextDraftDates('2026-09-23', 'Wednesday').athleteSees).toBe('2026-09-30');
  });

  it('with no stored day, Sunday is the day (effectiveWeeklySessionDay)', () => {
    expect(nextDraftDates(TUE, null).athleteSees).toBe('2026-09-27');
  });
});

describe('raceFacts — what the expanded card says about the horizon', () => {
  const view = {
    raceId: 'r1',
    raceName: 'Aarhus 70.3',
    raceDate: '2026-12-20',
    version: 0,
    stale: false,
    startDate: TUE,
    blocks: trainingBlocks(TUE, '2026-12-20'),
  };

  it('names the race, rounds weeks up, and the block today sits in', () => {
    // 89 days to race → 13 weeks, not 12.
    expect(raceFacts(TUE, view)).toEqual({ name: 'Aarhus 70.3', weeksOut: 13, blockName: view.blocks[0].name });
  });

  it('is null with no race, so the card omits the facts rather than inventing them', () => {
    expect(raceFacts(TUE, null)).toBeNull();
  });

  it('on race day the last block is still the block, at zero weeks out; after it there is no block', () => {
    expect(raceFacts('2026-12-20', view)).toEqual({ name: 'Aarhus 70.3', weeksOut: 0, blockName: view.blocks.at(-1)!.name });
    expect(raceFacts('2026-12-21', view)).toEqual({ name: 'Aarhus 70.3', weeksOut: 0, blockName: null });
  });
});

describe('dayChoice — changing the day is a confirmed step', () => {
  const idle = { current: 'Wednesday', proposed: null, write: null };

  it('a tap on another day proposes it and writes nothing', () => {
    expect(dayChoice(idle, { type: 'tap', day: 'Thursday' })).toEqual({ current: 'Wednesday', proposed: 'Thursday', write: null });
  });

  it('confirm yields exactly one write of the proposed day; cancel yields none and clears the proposal', () => {
    const proposing = dayChoice(idle, { type: 'tap', day: 'Thursday' });
    expect(dayChoice(proposing, { type: 'confirm' })).toEqual({ current: 'Wednesday', proposed: 'Thursday', write: 'Thursday' });
    expect(dayChoice(proposing, { type: 'cancel' })).toEqual(idle);
  });

  it('a tap on the current day proposes nothing, and confirm with nothing proposed writes nothing', () => {
    expect(dayChoice(idle, { type: 'tap', day: 'Wednesday' })).toEqual(idle);
    expect(dayChoice(idle, { type: 'confirm' })).toEqual(idle);
  });

  it('once the write lands, the day becomes current and the proposal clears', () => {
    const written = { current: 'Wednesday', proposed: 'Thursday', write: 'Thursday' };
    expect(dayChoice(written, { type: 'written' })).toEqual({ current: 'Thursday', proposed: null, write: null });
  });
});

describe('displayNameFor — the Preferred Name where one exists, else nothing', () => {
  it('returns the trimmed Preferred Name, or null for the card to say "the athlete" (the ruling)', () => {
    expect(displayNameFor('Sarah')).toBe('Sarah');
    expect(displayNameFor(' Sarah ')).toBe('Sarah');
    expect(displayNameFor(null)).toBeNull();
    expect(displayNameFor('  ')).toBeNull();
    expect(displayNameFor(undefined)).toBeNull();
  });
});

describe('coachSeesDay — the weekday the coach gets the draft, from the lead constant', () => {
  it('is HEAD_COACH_LEAD_DAYS before the athlete’s day, wrapping the week', () => {
    expect(HEAD_COACH_LEAD_DAYS).toBe(1); // the ruling this file leans on; a change moves every expectation below
    expect(coachSeesDay('Wednesday')).toBe('Tuesday');
    expect(coachSeesDay('Monday')).toBe('Sunday');
    expect(coachSeesDay(null)).toBe('Saturday'); // no stored day reads Sunday
  });
});

describe('dayMessageKey — the Settings catalogue key for a weekday', () => {
  it('maps each weekday, and an unknown value to Sunday', () => {
    expect(dayMessageKey('Monday')).toBe('dayMonday');
    expect(dayMessageKey('Sunday')).toBe('daySunday');
    expect(dayMessageKey('Funday')).toBe('daySunday');
  });
});

describe('commitDayChoice — the card’s glue between the reducer and the action', () => {
  const proposing = { current: 'Wednesday', proposed: 'Thursday', write: null };

  it('writes the proposed day exactly once and reports the written state', async () => {
    const write = vi.fn(async () => ({ ok: true as const }));
    expect(await commitDayChoice(proposing, write)).toEqual({ state: { current: 'Thursday', proposed: null, write: null }, error: null });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('Thursday');
  });

  it('on a refused write, keeps the current day, clears the proposal and returns the reason', async () => {
    const write = vi.fn(async () => ({ ok: false as const, reason: 'not-linked' as const }));
    expect(await commitDayChoice(proposing, write)).toEqual({ state: { current: 'Wednesday', proposed: null, write: null }, error: 'not-linked' });
  });

  it('with nothing proposed, writes nothing', async () => {
    const write = vi.fn(async () => ({ ok: true as const }));
    expect(await commitDayChoice({ current: 'Wednesday', proposed: null, write: null }, write)).toEqual({ state: { current: 'Wednesday', proposed: null, write: null }, error: null });
    expect(write).not.toHaveBeenCalled();
  });
});

describe('commitDismissal — Got it only closes the instruction if the write landed', () => {
  it('reports dismissed when the write succeeded', async () => {
    const write = vi.fn(async () => ({ ok: true as const }));
    expect(await commitDismissal(write)).toEqual({ dismissed: true, error: null });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('keeps the instruction on screen and returns the reason when the write was refused', async () => {
    // A session that expired in an open tab: closing the fold would tell the
    // coach they had been instructed while nothing was stored, and the whole
    // explanation would return on the next load with no word about why.
    const write = vi.fn(async () => ({ ok: false as const, reason: 'not-authenticated' as const }));
    expect(await commitDismissal(write)).toEqual({ dismissed: false, error: 'not-authenticated' });
  });
});

describe('a write that throws is a refusal, not a crash', () => {
  // A server action that rejects — the session gone, the database unreachable —
  // used to escape the transition and reach an error boundary, which replaces
  // the page rather than telling the coach the day did not change
  // (CodeRabbit, PR #102).
  it('keeps the current day and reports a failure when the day write throws', async () => {
    const write = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await commitDayChoice({ current: 'Wednesday', proposed: 'Thursday', write: null }, write)).toEqual({
      state: { current: 'Wednesday', proposed: null, write: null },
      error: 'failed',
    });
  });

  it('keeps the instruction on screen and reports a failure when the dismissal write throws', async () => {
    const write = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await commitDismissal(write)).toEqual({ dismissed: false, error: 'failed' });
  });
});
