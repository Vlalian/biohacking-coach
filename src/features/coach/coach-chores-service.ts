import { blockRepinChoresOf, type CoachChore } from './coach-chores';
import { getStaleBlockSetsForHeadCoach } from './training-block-repository';

/**
 * The chores waiting for a Head Coach, read by the app shell on every render
 * for an account holding active Coaching Links (`training-architecture/19`).
 *
 * **One query, before render, never deferred.** The shell already asks
 * whether the account holds links; this is the one further read, and only
 * for those accounts — an athlete without links costs nothing here. It runs
 * on the render path rather than in the shell's `after()` block, where the
 * roster draft runs, because a popup that arrives a page late is the Briefing
 * line the ticket refuses (triage, 2026-09-17). Zero rows is the common case
 * and costs one indexed read.
 */
export async function getCoachChores(userId: string): Promise<CoachChore[]> {
  return blockRepinChoresOf(await getStaleBlockSetsForHeadCoach(userId));
}
