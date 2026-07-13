// Session store — the single data-model foundation (ADR 0002).
// Every session is an identity-bearing entity here; the calendar, feedback
// flows, and Coach context all read and write through this module.
// Old localStorage keys (bh_week_plan, bh_plan_history, bh_session_feedback)
// are migration inputs only: read once, never modified.

const LS_SESSIONS = 'bh_sessions';
const LS_VERSION  = 'bh_store_version';
const LS_REPORT   = 'bh_migration_report';
const LS_UNAVAIL  = 'bh_unavailable_dates';
const LS_MOVELOG  = 'bh_move_log';
const LS_CREATELOG = 'bh_creation_log';

const STORE_VERSION = 1;
const HORIZON_WEEKS = 4;

const DOW_OFFSETS = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };

// Types that never count as training load. Other carries its own toggle.
const NON_TRAINING_TYPES = ['Rest', 'Mobility'];

export const SESSION_COLORS = {
  Endurance: '#4a90d9',
  Intensity: '#e05555',
  Tempo:     '#c9a96e',
  Recovery:  '#6db36d',
  Rest:      '#8a8a8a',
  Strength:  '#9b6dd6',
  Mobility:  '#4db6ac',
  Other:     '#9e9e9e',
};

export const SESSION_DEFAULTS = {
  Endurance: { duration: '90 min', zone: 'Zone 2',   note: 'Aerobic foundation — keep HR conversational and resist the urge to push.' },
  Intensity: { duration: '60 min', zone: 'Zone 4–5', note: 'Hit your intervals hard and recover fully between reps.' },
  Tempo:     { duration: '75 min', zone: 'Zone 3',   note: 'Comfortably hard — you should be able to speak in short sentences.' },
  Recovery:  { duration: '45 min', zone: 'Zone 1',   note: 'Easy movement to flush the legs. No ego today.' },
};

// Phase templates: one Mon–Sun pattern per Training Phase, used to materialize
// future horizon weeks as real stored Planned Sessions. Each phase carries one
// realistic two-session day so materialized weeks demonstrate Doubles.
export const WEEK_TEMPLATES = {
  'Early Base Building':    [['Endurance'], ['Rest'], ['Recovery'], ['Endurance'], ['Rest'], ['Endurance', 'Recovery'], ['Rest']],
  'Base Building':          [['Endurance'], ['Tempo'], ['Rest'], ['Endurance', 'Recovery'], ['Recovery'], ['Endurance'], ['Rest']],
  'Build Phase':            [['Endurance'], ['Intensity'], ['Recovery'], ['Tempo'], ['Rest'], ['Endurance', 'Recovery'], ['Intensity']],
  'Peak Phase':             [['Tempo'], ['Intensity'], ['Recovery'], ['Intensity', 'Recovery'], ['Rest'], ['Endurance'], ['Tempo']],
  'Taper':                  [['Endurance'], ['Rest'], ['Recovery'], ['Tempo'], ['Rest'], ['Endurance', 'Recovery'], ['Rest']],
  'Recovery':               [['Recovery'], ['Rest'], ['Recovery'], ['Rest'], ['Endurance', 'Recovery'], ['Rest'], ['Recovery']],
  'Return to Training':     [['Recovery'], ['Rest'], ['Endurance'], ['Rest'], ['Recovery'], ['Endurance', 'Recovery'], ['Rest']],
  'Off-season Maintenance': [['Endurance'], ['Rest'], ['Tempo'], ['Rest'], ['Endurance', 'Recovery'], ['Endurance'], ['Rest']],
};

// ── Date helpers ──────────────────────────────────────────────────────────────

export function getDateKey(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

export function addDays(dateKey, days) {
  const d = new Date(dateKey + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return getDateKey(d);
}

// Monday of the week containing dateKey.
export function weekStartOf(dateKey) {
  const d   = new Date(dateKey + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  return addDays(dateKey, -(day === 0 ? 6 : day - 1));
}

function todayKey() {
  return getDateKey(new Date());
}

// ── Persistence primitives ────────────────────────────────────────────────────

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || fallback); }
  catch { return JSON.parse(fallback); }
}

function loadSessions() {
  return readJson(LS_SESSIONS, '[]');
}

function saveSessions(sessions) {
  localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
}

let idCounter = 0;
function mintId() {
  idCounter += 1;
  return `s_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function nextDayOrder(sessions, dateKey) {
  return sessions.filter(s => s.dateKey === dateKey)
                 .reduce((max, s) => Math.max(max, s.dayOrder), 0) + 1;
}

function makeEntity(sessions, fields) {
  const type = fields.type;
  return {
    id:         mintId(),
    dateKey:    fields.dateKey,
    type,
    origin:     fields.origin || 'coach',
    status:     fields.status || 'planned',
    parked:     fields.parked || false,
    isTraining: fields.isTraining !== undefined ? fields.isTraining : !NON_TRAINING_TYPES.includes(type),
    duration:   fields.duration ?? SESSION_DEFAULTS[type]?.duration ?? null,
    zone:       fields.zone     ?? SESSION_DEFAULTS[type]?.zone     ?? null,
    note:       fields.note     ?? SESSION_DEFAULTS[type]?.note     ?? null,
    title:      fields.title    ?? null, // athlete's own name for the session
    dayOrder:   fields.dayOrder || nextDayOrder(sessions, fields.dateKey),
    feedback:   fields.feedback || null,
  };
}

// ── CRUD and queries ──────────────────────────────────────────────────────────

export function allSessions() {
  return loadSessions();
}

export function getSession(id) {
  return loadSessions().find(s => s.id === id) || null;
}

export function createSession(fields) {
  const sessions = loadSessions();
  const entity   = makeEntity(sessions, fields);
  sessions.push(entity);
  saveSessions(sessions);
  return entity;
}

export function updateSession(id, patch) {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return null;
  sessions[idx] = { ...sessions[idx], ...patch };
  saveSessions(sessions);
  return sessions[idx];
}

export function deleteSession(id) {
  saveSessions(loadSessions().filter(s => s.id !== id));
}

export function sessionsForDay(dateKey) {
  return loadSessions()
    .filter(s => s.dateKey === dateKey)
    .sort((a, b) => a.dayOrder - b.dayOrder);
}

export function sessionsForWeek(dateKey) {
  const start = weekStartOf(dateKey);
  const end   = addDays(start, 6);
  return loadSessions()
    .filter(s => s.dateKey >= start && s.dateKey <= end)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.dayOrder - b.dayOrder);
}

// Relocates a session to another day: dayOrder is minted fresh, appended at
// the end of the target day (gaps left on the source day are fine).
export function moveSession(id, targetDateKey) {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return null;
  const others = sessions.filter(s => s.id !== id);
  sessions[idx] = { ...sessions[idx], dateKey: targetDateKey, dayOrder: nextDayOrder(others, targetDateKey) };
  saveSessions(sessions);
  return sessions[idx];
}

// ── Silent move log ───────────────────────────────────────────────────────────
// Every Session Move is logged internally; nothing is surfaced to the athlete.
// The log feeds Pattern Insight and reaches the Coach at the Weekly Session.

export function appendMoveLog(entry) {
  const log = getMoveLog();
  log.push(entry);
  localStorage.setItem(LS_MOVELOG, JSON.stringify(log));
}

export function getMoveLog() {
  return readJson(LS_MOVELOG, '[]');
}

// Athlete Session creations are logged the same silent way.
export function appendCreationLog(entry) {
  const log = getCreationLog();
  log.push(entry);
  localStorage.setItem(LS_CREATELOG, JSON.stringify(log));
}

export function getCreationLog() {
  return readJson(LS_CREATELOG, '[]');
}

// 1-based position of a session among same-type sessions on its day — the
// natural-reference qualifier, present only when date + type is ambiguous
// (a same-type Double). Returns null otherwise.
function sameTypePosition(sessions, session) {
  const sameType = sessions
    .filter(o => o.dateKey === session.dateKey && o.type === session.type)
    .sort((a, b) => a.dayOrder - b.dayOrder);
  return sameType.length > 1 ? sameType.findIndex(o => o.id === session.id) + 1 : null;
}

// The current week's Session Moves and Athlete Session creations, shaped as
// natural-reference data for the Weekly Session request: type + dates, with a
// 1-based position only when the moved session sits in a same-type Double.
// Entity ids never leave the client.
export function getWeekActivity() {
  const weekStart = weekStartOf(todayKey());
  const weekEnd   = addDays(weekStart, 6);
  const inWeek    = k => k >= weekStart && k <= weekEnd;
  const sessions  = loadSessions();

  const moves = getMoveLog().filter(m => inWeek(m.to)).map(m => {
    const ref = { sessionType: m.sessionType, from: m.from, to: m.to };
    const s = sessions.find(x => x.id === m.sessionId);
    const position = s && sameTypePosition(sessions, s);
    if (position) ref.position = position;
    return ref;
  });

  // A retro-log performed this week lands on a past date — filter by when the
  // athlete acted (createdOn), not where the session sits.
  const creations = getCreationLog()
    .filter(c => inWeek(c.createdOn ?? c.dateKey))
    .map(({ sessionType, dateKey, retro }) => ({ sessionType, dateKey, retro }));

  return { moves, creations };
}

// ── Unavailable dates (date-level, distinct from unavailable sessions) ────────

function loadUnavailableDates() {
  return readJson(LS_UNAVAIL, '[]');
}

function addUnavailableDate(dateKey) {
  const dates = loadUnavailableDates();
  if (!dates.includes(dateKey)) {
    dates.push(dateKey);
    localStorage.setItem(LS_UNAVAIL, JSON.stringify(dates));
  }
}

// Upcoming (today onwards) unavailable dates: date-level declarations plus
// days holding a session flipped to unavailable.
export function getUnavailableDates() {
  const today = todayKey();
  const dates = new Set(loadUnavailableDates().filter(d => d >= today));
  loadSessions()
    .filter(s => s.status === 'unavailable' && s.dateKey >= today)
    .forEach(s => dates.add(s.dateKey));
  return [...dates].sort();
}

// Marks a whole day as "training can't happen here": flips the day's sessions
// to unavailable, or records a date-level entry when the day is empty.
export function markDateUnavailable(dateKey) {
  const day = sessionsForDay(dateKey).filter(s => s.type !== 'Rest');
  if (day.length === 0) return addUnavailableDate(dateKey);
  day.forEach(s => updateSession(s.id, { status: 'unavailable' }));
}

// ── Coach-context reads (formerly date-keyed feedback lookups) ────────────────

function lastSevenDaysCutoff() {
  return addDays(todayKey(), -7);
}

// Skipped sessions of the last 7 days as natural references: date + type,
// with a 1-based position only when two same-type sessions share the day
// (the only case where date + type is ambiguous).
export function getSkippedSessions() {
  const cutoff   = lastSevenDaysCutoff();
  const sessions = loadSessions();
  return sessions
    .filter(s => s.status === 'skipped' && s.dateKey >= cutoff)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.dayOrder - b.dayOrder)
    .map(s => {
      const ref = { date: s.dateKey, sessionType: s.type };
      const position = sameTypePosition(sessions, s);
      if (position) ref.position = position;
      return ref;
    });
}

export function getLastWeekFeedback() {
  const cutoff = lastSevenDaysCutoff();
  return loadSessions()
    .filter(s => s.feedback && s.dateKey >= cutoff)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.dayOrder - b.dayOrder)
    .map(s => ({ dateKey: s.dateKey, sessionType: s.type, ...s.feedback }));
}

// Records a Session Reflection against the day's session (single-session
// semantics in this slice). A rating on an empty day — a detected workout the
// plan never covered — mints the completed entity on the spot.
export function rateDay(dateKey, sessionType, feedback) {
  const day = sessionsForDay(dateKey).filter(s => s.type !== 'Rest');
  if (day.length === 0) {
    return createSession({ dateKey, type: sessionType, origin: 'coach', status: 'completed', feedback });
  }
  return updateSession(day[0].id, { status: 'completed', feedback });
}

// ── Weekly plan agreement (write-path redirect) ───────────────────────────────

// Replaces the week's provisional (planned, coach-origin) sessions with the
// agreed plan. Completed/skipped/unavailable sessions are athlete reality and
// survive; other weeks are untouched. Rest days are stored as entities too.
export function agreeWeeklyPlan(weekStartKey, planSessions) {
  const start = weekStartOf(weekStartKey);
  const end   = addDays(start, 6);
  const sessions = loadSessions().filter(s =>
    !(s.dateKey >= start && s.dateKey <= end && s.origin === 'coach' && s.status === 'planned')
  );
  planSessions.forEach(p => {
    const offset = DOW_OFFSETS[p.dayOfWeek];
    if (offset === undefined || !p.type) return;
    sessions.push(makeEntity(sessions, {
      dateKey:  addDays(start, offset),
      type:     p.type,
      origin:   'coach',
      duration: p.duration,
      zone:     p.zone,
      note:     p.note,
    }));
  });
  saveSessions(sessions);
  seedHorizon();
}

// ── Horizon seeding ───────────────────────────────────────────────────────────

function currentPhase() {
  const stored = localStorage.getItem('bca_phase');
  if (stored && WEEK_TEMPLATES[stored]) return stored;
  try {
    const profile = JSON.parse(localStorage.getItem('bh_athlete_profile') || 'null');
    if (profile?.phase && WEEK_TEMPLATES[profile.phase]) return profile.phase;
  } catch { /* fall through */ }
  return 'Base Building';
}

// Materializes future weeks in the Coach's planning horizon as real stored
// Planned Sessions from the phase template. Only fills weeks that hold nothing
// yet — agreed plans and athlete edits always win. Returns weeks seeded.
function seedHorizon() {
  const template  = WEEK_TEMPLATES[currentPhase()];
  const thisWeek  = weekStartOf(todayKey());
  const sessions  = loadSessions();
  let seededWeeks = 0;

  for (let w = 1; w <= HORIZON_WEEKS; w++) {
    const start = addDays(thisWeek, 7 * w);
    const end   = addDays(start, 6);
    if (sessions.some(s => s.dateKey >= start && s.dateKey <= end)) continue;
    template.forEach((types, dayIdx) => {
      types.forEach(type => {
        sessions.push(makeEntity(sessions, { dateKey: addDays(start, dayIdx), type, origin: 'coach' }));
      });
    });
    seededWeeks += 1;
  }

  saveSessions(sessions);
  return seededWeeks;
}

// ── Migration ─────────────────────────────────────────────────────────────────

// Status and feedback for a legacy feedback record.
function legacyStatus(record) {
  if (!record) return { status: 'planned', feedback: null };
  if (record.skipped)     return { status: 'skipped', feedback: null };
  if (record.unavailable) return { status: 'unavailable', feedback: null };
  if (record.body || record.mind) {
    return { status: 'completed', feedback: { body: record.body || null, mind: record.mind || null, comment: record.comment || '' } };
  }
  return { status: 'planned', feedback: null };
}

// Type for template-era feedback with no stored sessionType: the phase
// template's first session for that day of week, mirroring what the old
// calendar would have rendered there.
function templateTypeFor(dateKey) {
  const template = WEEK_TEMPLATES[currentPhase()];
  const d        = new Date(dateKey + 'T00:00:00');
  const dayIdx   = (d.getDay() + 6) % 7;
  return template[dayIdx]?.find(t => t !== 'Rest') || 'Endurance';
}

// One-shot idempotent migration of the legacy date-keyed shapes into entities.
// Returns the migration report counts, or null when already migrated.
export function initStore() {
  const version = parseInt(localStorage.getItem(LS_VERSION) || '0', 10);
  if (version >= STORE_VERSION) return null;

  const weekPlan = (() => {
    const p = readJson('bh_week_plan', 'null');
    return (p && p.weekStart && p.sessions) ? p : null;
  })();
  const history  = readJson('bh_plan_history', '[]');
  const feedback = readJson('bh_session_feedback', '{}');

  const sessions = loadSessions();
  const consumedFeedback = new Set();
  const coveredDays      = new Set();
  const counts = { sessions: 0, ratings: 0, skips: 0, unavailable: 0, seededWeeks: 0, unmatched: 0 };

  function mintFrom(dateKey, type, extra, record) {
    const { status, feedback: fb } = legacyStatus(record);
    sessions.push(makeEntity(sessions, { dateKey, type, origin: 'coach', status, feedback: fb, ...extra }));
    coveredDays.add(dateKey);
    counts.sessions += 1;
    if (status === 'completed')   counts.ratings += 1;
    if (status === 'skipped')     counts.skips += 1;
    if (status === 'unavailable') counts.unavailable += 1;
    if (record) consumedFeedback.add(dateKey);
  }

  // Agreed week plan — Rest included: Rest is content now.
  if (weekPlan) {
    const start = weekPlan.weekStart;
    weekPlan.sessions.forEach(s => {
      const offset = DOW_OFFSETS[s.dayOfWeek];
      if (offset === undefined || !s.type) return;
      const dateKey = addDays(start, offset);
      const record  = s.type === 'Rest' ? null : feedback[dateKey];
      mintFrom(dateKey, s.type, { duration: s.duration, zone: s.zone, note: s.note }, record);
    });
  }

  // Plan history — skip days the week plan already covered.
  history.forEach(h => {
    if (!h.dateKey || !h.type || coveredDays.has(h.dateKey)) return;
    mintFrom(h.dateKey, h.type, { duration: h.duration, zone: h.zone, note: h.note }, feedback[h.dateKey]);
  });

  // Remaining feedback: template-era records on days no plan record covers.
  Object.entries(feedback).forEach(([dateKey, record]) => {
    if (consumedFeedback.has(dateKey) || coveredDays.has(dateKey)) return;
    if (record.sessionType || record.body || record.mind || record.skipped) {
      mintFrom(dateKey, record.sessionType || templateTypeFor(dateKey), {}, record);
    } else if (record.unavailable) {
      addUnavailableDate(dateKey);
      counts.unavailable += 1;
    } else {
      counts.unmatched += 1;
      console.warn(`Migration: unmatched feedback entry kept at ${dateKey}`, record);
    }
  });

  saveSessions(sessions);
  // Seed the horizon for anyone with real plan data. A truly fresh athlete
  // (nothing agreed, nothing recorded) keeps an honest empty calendar.
  if (weekPlan || history.length > 0) counts.seededWeeks = seedHorizon();
  localStorage.setItem(LS_VERSION, String(STORE_VERSION));

  const hadLegacyState = counts.sessions > 0 || counts.unavailable > 0 || counts.unmatched > 0;
  if (!hadLegacyState) return null;

  localStorage.setItem(LS_REPORT, JSON.stringify({ ...counts, dismissed: false }));
  console.log(`Migration complete: ${counts.sessions} sessions, ${counts.ratings} ratings, ${counts.skips} skips, ` +
              `${counts.unavailable} unavailable, ${counts.seededWeeks} future weeks seeded, ${counts.unmatched} unmatched (kept).`);
  return counts;
}

export function getMigrationReport() {
  return readJson(LS_REPORT, 'null');
}

export function dismissMigrationReport() {
  const report = getMigrationReport();
  if (report) localStorage.setItem(LS_REPORT, JSON.stringify({ ...report, dismissed: true }));
}
