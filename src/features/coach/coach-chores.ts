import { repinBlockSet, staleLastBlockOf, type StoredBlockSet } from './training-blocks';

/**
 * Coach chores (`training-architecture/19`): the things waiting for a Head
 * Coach that cost one click and must find them rather than wait to be found
 * (ruling 3, 2026-09-15 — a popup on login, not a Briefing line and not a
 * disabled field on the plan tab).
 *
 * A list of chores with one kind today, by the triage ruling of 2026-09-17: a
 * list costs nothing extra, and the consent gate nobody answered and 17's
 * unanswered proposal slot in later as further kinds without the dialog
 * changing shape. Nothing here is built for them beyond the union.
 *
 * Pure: the shell reads the stale sets and hands them here; this decides what
 * each row offers. Which button a row gets is decided **before** the click,
 * from the same {@link repinBlockSet} the repair will run, so the Head Coach
 * never clicks "Re-pin" only to be told the race moved too far.
 */

/** What the stale-set read hands over, per row. Structural: the repository's record satisfies it. */
export interface StaleBlockSetInput {
  set: StoredBlockSet & { athleteId: string; raceId: string; version: number };
  athleteName: string;
  raceName: string;
  raceDate: string;
}

/**
 * How a stale set can be repaired: re-pinned in place, or — when the race
 * moved so early that fewer than two blocks survive — started over from the
 * arithmetic draft, with the names that would go so the row can say why.
 */
export type BlockSetRepair = { kind: 'repin' } | { kind: 'restart'; dropped: string[] };

export interface BlockRepinChore {
  kind: 'repin-block-set';
  athleteId: string;
  athleteName: string;
  raceId: string;
  raceName: string;
  /** Where the race is now. */
  raceDate: string;
  /** Where the set still ends: its last block's name and end date. */
  lastBlockName: string;
  lastBlockEnd: string;
  /** The version the repair must compare-and-swap against. */
  version: number;
  repair: BlockSetRepair;
}

/** The one kind today. */
export type CoachChore = BlockRepinChore;

/**
 * Which repair a stale set is offered, from the pure re-pin's own answer. A
 * set the re-pin refuses for any reason — too few survivors, or a stored set
 * the validator would no longer accept — is offered the draft: a button that
 * can only fail is not a repair.
 */
export function repairFor(set: StoredBlockSet, raceDate: string): BlockSetRepair {
  const repinned = repinBlockSet(set, raceDate);
  return repinned.ok ? { kind: 'repin' } : { kind: 'restart', dropped: repinned.dropped };
}

/** One chore per stale set, in the order the read gave them. */
export function blockRepinChoresOf(stale: StaleBlockSetInput[]): BlockRepinChore[] {
  return stale.map(({ set, athleteName, raceName, raceDate }) => {
    // The read's WHERE is `isStaleSet` in SQL, so this is never null for a
    // row it returned; the sentence is the Briefing's, from the one rule.
    const last = staleLastBlockOf(set, raceDate);
    return {
      kind: 'repin-block-set',
      athleteId: set.athleteId,
      athleteName,
      raceId: set.raceId,
      raceName,
      raceDate,
      lastBlockName: last?.lastBlockName ?? '',
      lastBlockEnd: last?.endsOn ?? '',
      version: set.version,
      repair: repairFor(set, raceDate),
    };
  });
}
