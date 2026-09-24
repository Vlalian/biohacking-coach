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
  if (!horizon.race) return { race: null, block: null };
  const block = currentBlock(todayKey, horizon.blocks);
  return {
    race: { name: horizon.race.name, days: Math.max(0, daysBetween(todayKey, horizon.race.date)) },
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
