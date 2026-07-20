import { weekStartOf } from '@/lib/date';

/**
 * The Move rules — pure, storage-free, framework-free. Ported from the POC's
 * `rules.js`; its table-driven tests are the rule matrix and come across intact.
 *
 * This module decides *legality* only (frozen / bounce / move). It is the same
 * decision on the server, which is the authority (ADR 0006), and on the client,
 * which may use it to shape affordances but never to permit a move.
 */

/** The minimal shape the rules read off a session: when it is and its status. */
export type MoveCandidate = {
  date: string;
  status: string;
};

export type MoveVerdict = 'frozen' | 'bounce' | 'move';

/**
 * A session that cannot be lifted at all: a completed session, or anything in a
 * past week. The training record is immutable, and Week Rebalancing has already
 * absorbed old missed load (ADR 0002).
 */
export function isFrozen(session: MoveCandidate, todayKey: string): boolean {
  return (
    session.status === 'completed' ||
    weekStartOf(session.date) < weekStartOf(todayKey)
  );
}

/**
 * Classifies an attempted Session Move:
 *
 * - `frozen` — the session cannot be lifted at all (see {@link isFrozen}).
 * - `bounce` — the target is invalid and nothing changes: the session's own day,
 *   a past day, or any day outside the session's own Mon–Sun week. The Cross-Week
 *   Move is retired — the week is the planning unit; catch-up belongs to the
 *   Weekly Session.
 * - `move` — a silent within-week Session Move.
 */
export function classifyMove(
  session: MoveCandidate,
  targetDate: string,
  todayKey: string,
): MoveVerdict {
  if (isFrozen(session, todayKey)) return 'frozen';
  if (targetDate === session.date) return 'bounce';
  if (targetDate < todayKey) return 'bounce';
  if (weekStartOf(targetDate) !== weekStartOf(session.date)) return 'bounce';
  return 'move';
}
