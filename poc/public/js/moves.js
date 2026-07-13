// Move orchestrator — the thin public API the drag UI calls:
// classify → resolve → persist → log. Rules live in rules.js (pure);
// persistence lives in store.js. This module just wires them together.
import { classifyMove, resolveDrop } from './rules.js';
import {
  getSession, sessionsForDay, createSession, moveSession, updateSession, deleteSession,
  appendMoveLog, appendCreationLog, getDateKey,
} from './store.js';

// Applies an attempted Session Move. Returns the verdict:
// 'move' — applied and logged; 'frozen' / 'bounce' — no state change.
export function applyMove(sessionId, targetDateKey) {
  const session = getSession(sessionId);
  if (!session) return 'bounce';

  const todayKey = getDateKey(new Date());
  const verdict  = classifyMove(session, targetDateKey, todayKey);
  if (verdict !== 'move') return verdict;

  const resolution  = resolveDrop(session, sessionsForDay(targetDateKey));
  if (resolution.noop) return 'bounce';
  const fromDateKey = session.dateKey;

  moveSession(sessionId, targetDateKey);
  updateSession(sessionId, {
    // Moving a skipped or unavailable session revives it — the athlete
    // intends to do it on the new day. A parked session revives the same way.
    status: resolution.parkIncoming ? 'unavailable' : resolution.incomingStatus,
    parked: resolution.parkIncoming,
  });
  resolution.displaceIds.forEach(id => updateSession(id, { status: 'unavailable', parked: true }));

  // Auto-restore sweep: when a Rest block leaves a day, that day's parked
  // sessions return to planned on their own.
  if (session.type === 'Rest') restoreParkedOn(fromDateKey);

  appendMoveLog({ sessionId, sessionType: session.type, from: fromDateKey, to: targetDateKey });
  return 'move';
}

function restoreParkedOn(dateKey) {
  const day = sessionsForDay(dateKey);
  if (day.some(s => s.type === 'Rest')) return;
  day.filter(s => s.parked).forEach(s => updateSession(s.id, { status: 'planned', parked: false }));
}

// ── Athlete Sessions ──────────────────────────────────────────────────────────
// Sessions the athlete authors: Mobility (never load), Strength (always load),
// Other (its own toggle). Creating on a past day is a retro-log — the session
// is born completed (done but forgotten; there is no deadline on recording
// reality). Creation is silently logged and never challenged in the moment.

export function createAthleteSession({ dateKey, type, isTraining, title, duration, note }) {
  const todayKey = getDateKey(new Date());
  const retro    = dateKey < todayKey;
  const session = createSession({
    dateKey, type, title, duration, note,
    origin:     'athlete',
    isTraining: type === 'Strength' ? true : type === 'Mobility' ? false : !!isTraining,
    status:     retro ? 'completed' : 'planned',
  });
  // createdOn records when the athlete acted — a retro-log done this week
  // belongs to this week's activity even though the session sits in the past.
  appendCreationLog({ sessionId: session.id, sessionType: type, dateKey, retro, createdOn: todayKey });
  return session;
}

export function editAthleteSession(id, patch) {
  const session = getSession(id);
  if (!session || session.origin !== 'athlete') return null;
  const allowed = {};
  ['title', 'duration', 'note', 'isTraining'].forEach(k => {
    if (patch[k] !== undefined) allowed[k] = patch[k];
  });
  return updateSession(id, allowed);
}

export function deleteAthleteSession(id) {
  const session = getSession(id);
  if (!session || session.origin !== 'athlete') return;
  deleteSession(id);
}
