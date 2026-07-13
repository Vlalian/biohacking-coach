// Move rules — pure functions, no storage, no DOM. The table-driven tests in
// test/rules.test.mjs are the rule matrix; this module encodes it.
import { weekStartOf } from './store.js';

// A session that cannot be lifted at all: completed sessions and everything
// in past weeks — the training record is immutable, and Week Rebalancing has
// already absorbed old missed load.
export function isFrozen(session, todayKey) {
  return session.status === 'completed'
      || weekStartOf(session.dateKey) < weekStartOf(todayKey);
}

// Classifies an attempted Session Move.
// 'frozen' — the session cannot be lifted at all (see isFrozen).
// 'bounce' — the drop target is invalid, nothing changes: past days, the
//            session's own day, and any day outside the session's own Mon–Sun
//            week (the Cross-Week Move is retired — the week is the planning
//            unit; catch-up belongs in the Weekly Session).
// 'move'   — a silent within-week Session Move.
export function classifyMove(session, targetDateKey, todayKey) {
  if (isFrozen(session, todayKey)) return 'frozen';
  if (targetDateKey === session.dateKey) return 'bounce';
  if (targetDateKey < todayKey) return 'bounce';
  if (weekStartOf(targetDateKey) !== weekStartOf(session.dateKey)) return 'bounce';
  return 'move';
}

// Resolves what a valid drop does to the target day.
// Training onto training never conflicts — it forms a Double, unlimited.
// (Rest dominance — parking and displacement — lands with the Displacement
// rule; without Rest involved every drop simply places the session planned.)
export function resolveDrop(moving, occupants) {
  return {
    incomingStatus: 'planned', // moving a skipped/unavailable session revives it
    parkIncoming:   false,
    displaceIds:    [],
  };
}
