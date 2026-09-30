import { daysBetween } from '@/lib/date';
import { blockPosition, currentBlock, type TrainingBlock } from './training-blocks';

/**
 * What a Roster card says about one athlete (Mads, 2026-09-24): the target
 * race with the days left to it, and the Training Block today falls in with
 * the week inside it. Read from the same resolved horizon the athlete's Plan
 * tab shows the Head Coach, so the Roster reveals nothing that page does not.
 *
 * Pure: the page reads the horizon and hands it here.
 */
export interface RosterCard {
  race: { name: string; days: number } | null;
  block: { name: string; week: number; weeks: number } | null;
}

export function rosterCardOf(
  horizon: { race: { name: string; date: string } | null; blocks: TrainingBlock[] },
  todayKey: string,
): RosterCard {
  // The race while it is ahead, and the block whichever horizon it hangs off:
  // an athlete with no race has the Open Horizon's (`training-architecture/13`).
  const { race } = horizon;
  const block = currentBlock(todayKey, horizon.blocks);
  return {
    race: race && race.date >= todayKey ? { name: race.name, days: daysBetween(todayKey, race.date) } : null,
    block: block ? { name: block.name, ...blockPosition(todayKey, block) } : null,
  };
}

/** The card's initials, from the name the athlete gave the app: first and last word. */
export function initialsOf(name: string): string {
  const [first, ...rest] = name.match(/\S+/g) ?? [];
  if (!first) return '·';
  const last = rest.at(-1);
  return (first.charAt(0) + (last?.charAt(0) ?? '')).toUpperCase();
}
