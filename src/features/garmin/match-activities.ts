/**
 * Reconciling a Detected Activity against the Week Plan — pure, storage-free.
 *
 * `CONTEXT.md` (Detected Activity) states the rule this module serves in the
 * strongest terms the glossary uses anywhere: detection **proposes, it never
 * asserts**. Matching is the first half of that. It decides *which* Planned
 * Session an activity is a proposed completion of, and nothing else — no write,
 * no status, no rating. The second half is that the athlete's Session
 * Reflection is what commits it.
 *
 * Ported from the retired `garmin-sync/03`, whose rules survived the design
 * and not the Next.js rewrite: the import had been inserting a new completed
 * session per activity, so uploading a ride onto a day that already planned
 * one produced two entries for one ride (showable-version/14).
 */

/** The minimal shape matching reads off a session on the activity's day. */
export type MatchCandidate = {
  id: string;
  date: string;
  type: string;
  status: string;
  parked: boolean;
  dayOrder: number;
};

/** The minimal shape matching reads off a parsed activity. */
export type MatchableActivity = {
  date: string;
  sessionType: string;
};

export type ActivityMatch<A extends MatchableActivity> = {
  activity: A;
  /** The Planned Session this proposes to complete, or null to offer as new. */
  matchedSessionId: string | null;
};

/**
 * Pairs each activity with at most one Planned Session.
 *
 * A candidate must be on the same day, still `planned`, and not parked — a
 * parked session is one the athlete has declared can't happen as placed
 * (CONTEXT.md, Unavailable), so completing it from a file would contradict
 * them. Among the candidates, the same Session Type wins; otherwise the
 * earliest `dayOrder` does, which is the day's own order of intent.
 *
 * Claimed sessions are removed from the pool as it goes, so two uploads on a
 * Double day take the two planned sessions and a third matches nothing rather
 * than double-completing one. Every activity comes back either way — an
 * unmatched one is not dropped, it becomes the offer to retro-log.
 */
export function matchActivities<A extends MatchableActivity>(
  activities: A[],
  candidates: MatchCandidate[],
): ActivityMatch<A>[] {
  const unclaimed = candidates.filter((c) => c.status === 'planned' && !c.parked);

  return activities.map((activity) => {
    const onDay = unclaimed
      .filter((c) => c.date === activity.date)
      .sort((a, b) => a.dayOrder - b.dayOrder);

    const match = onDay.find((c) => c.type === activity.sessionType) ?? onDay[0];
    if (!match) return { activity, matchedSessionId: null };

    unclaimed.splice(unclaimed.indexOf(match), 1);
    return { activity, matchedSessionId: match.id };
  });
}
