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
 * Whether a session can take an activity's completion.
 *
 * On the same day, still `planned`, and not parked — a parked session is one
 * the athlete has declared can't happen as placed (CONTEXT.md, Unavailable),
 * so completing it from a file would contradict them.
 *
 * Three callers share this and must: matching at import, the re-check when the
 * athlete accepts (the session can change in between), and the proposal card,
 * which promises "this completes your planned session" and would be lying if
 * it used a looser rule than the accept path.
 */
export function isEligibleMatch(
  candidate: Pick<MatchCandidate, 'date' | 'status' | 'parked'>,
  activityDate: string,
): boolean {
  return (
    candidate.date === activityDate && candidate.status === 'planned' && !candidate.parked
  );
}

/**
 * Whether a session is one the *athlete* may point an activity at.
 *
 * Deliberately wider than {@link isEligibleMatch}, and the gap between them is
 * the propose/assert split itself. The machine may only claim a session that
 * is still planned and unparked — anything else would be detection asserting
 * over a decision the athlete already made. The athlete is under no such
 * limit: they are allowed to say "I skipped that in the app but I did it", or
 * "it was displaced by a Rest day and I did it anyway", and the file is their
 * evidence.
 *
 * The one thing neither may touch is a session already completed. That is the
 * record, and a second activity on the same day is a Double — a new session,
 * not an overwrite of an old one.
 */
export function isChoosableTarget(
  candidate: Pick<MatchCandidate, 'date' | 'status'>,
  activityDate: string,
): boolean {
  return candidate.date === activityDate && candidate.status !== 'completed';
}

/**
 * Pairs each activity with at most one Planned Session.
 *
 * Eligibility is {@link isEligibleMatch}. Among the sessions that pass it, the
 * same Session Type wins; otherwise the earliest `dayOrder` does, which is the
 * day's own order of intent.
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
  const unclaimed = [...candidates];

  return activities.map((activity) => {
    const onDay = unclaimed
      .filter((c) => isEligibleMatch(c, activity.date))
      .sort((a, b) => a.dayOrder - b.dayOrder);

    const match = onDay.find((c) => c.type === activity.sessionType) ?? onDay[0];
    if (!match) return { activity, matchedSessionId: null };

    unclaimed.splice(unclaimed.indexOf(match), 1);
    return { activity, matchedSessionId: match.id };
  });
}
