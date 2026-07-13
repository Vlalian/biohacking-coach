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

// Resolves what a valid drop does to the target day (the Displacement rule).
// Rest is dominant and never displaced:
// - Rest onto training flips every non-completed training on the day to
//   parked-unavailable, in place; the Rest lands active.
// - Training onto a Rest day parks the incoming session as unavailable.
// - Rest onto Rest is a no-op — Rest days cannot be part of a Double.
// - Training onto training never conflicts — it forms a Double, unlimited.
// - Non-load sessions coexist with Rest: no displacement, no parking.
// Completed sessions are never touched — the training record is immutable.
export function resolveDrop(moving, occupants) {
  const place = { incomingStatus: 'planned', parkIncoming: false, displaceIds: [] };

  if (moving.type === 'Rest') {
    if (occupants.some(o => o.type === 'Rest')) return { ...place, noop: true };
    return {
      ...place,
      displaceIds: occupants
        .filter(o => o.isTraining && o.status !== 'completed')
        .map(o => o.id),
    };
  }

  if (moving.isTraining && occupants.some(o => o.type === 'Rest')) {
    return { incomingStatus: 'unavailable', parkIncoming: true, displaceIds: [] };
  }

  return place; // moving a skipped/unavailable session revives it
}
