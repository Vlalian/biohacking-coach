import type { ParsedSession } from './garmin';
import { isEligibleMatch, type MatchCandidate } from './match-activities';

/**
 * Sorting an uploaded training history (`garmin-integration/03`) — pure,
 * storage-free.
 *
 * A history upload lands most activities straight into the record as completed
 * sessions, because they are the past: there is no plan they could complete and
 * no Session Reflection to ask for months later. The one exception is an
 * activity on a day that still holds a Planned Session. That is exactly the
 * case detection exists for, so it becomes a proposal the athlete decides on,
 * whichever button brought it in.
 *
 * Nothing already on file is imported twice. An activity is keyed by its start
 * time; one without a start time has no key and always lands, because a weaker
 * fingerprint (date + sport + duration) would silently collapse two real
 * sessions on one day into one — a duplicate is visible and deletable, a
 * dropped session is neither (ballot 9).
 */

/** The idempotency key of an activity: its start time, or none without one. */
export function externalIdOf(activity: ParsedSession): string | null {
  return activity.startTime === null ? null : `garmin:${activity.startTime}`;
}

export type HistoryImportPlan = {
  /** Activities written as completed history sessions. */
  history: ParsedSession[];
  /** Activities on a day with an eligible Planned Session, sent to detection. */
  proposals: ParsedSession[];
};

export function planHistoryImport(
  parsed: readonly ParsedSession[],
  onFile: {
    planned: readonly Pick<MatchCandidate, 'id' | 'date' | 'status' | 'parked'>[];
    knownIds: ReadonlySet<string>;
  },
): HistoryImportPlan {
  const fresh = unseen(parsed, onFile.knownIds);
  const hasPlan = (a: ParsedSession) => onFile.planned.some((s) => isEligibleMatch(s, a.date));
  return {
    history: fresh.filter((a) => !hasPlan(a)),
    proposals: fresh.filter(hasPlan),
  };
}

/** Every activity whose key is not on file and not earlier in the batch; keyless ones all pass. */
function unseen(parsed: readonly ParsedSession[], knownIds: ReadonlySet<string>): ParsedSession[] {
  const seen = new Set(knownIds);
  return parsed.filter((activity) => {
    const id = externalIdOf(activity);
    if (id === null) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
