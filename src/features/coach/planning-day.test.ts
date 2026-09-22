import { describe, it, expect } from 'vitest';
import { dayChoice, displayNameFor, nextDraftDates, raceFacts } from './planning-day';
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

describe('displayNameFor — the Preferred Name where one exists', () => {
  it('prefers the Preferred Name, falls back to the athlete name, ignores whitespace', () => {
    expect(displayNameFor('Sarah', 'S. Jensen')).toBe('Sarah');
    expect(displayNameFor(null, 'S. Jensen')).toBe('S. Jensen');
    expect(displayNameFor('  ', 'S. Jensen')).toBe('S. Jensen');
    expect(displayNameFor(' Sarah ', 'S. Jensen')).toBe('Sarah');
  });
});
