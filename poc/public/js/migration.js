// One-shot migration of the legacy date-keyed localStorage shapes
// (bh_week_plan, bh_plan_history, bh_session_feedback) into session entities.
// Idempotent via the bh_store_version marker; the old keys are read, never
// deleted or modified. The store itself knows nothing about legacy shapes.
import {
  readJson, createSession, markDateUnavailable, seedHorizon,
  currentPhase, WEEK_TEMPLATES, DOW_OFFSETS, addDays,
} from './store.js';

const LS_VERSION = 'bh_store_version';
const LS_REPORT  = 'bh_migration_report';

const STORE_VERSION = 1;

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

// Runs the migration once. Returns the report counts, or null when already
// migrated or there was nothing to carry over.
export function initStore() {
  const version = parseInt(localStorage.getItem(LS_VERSION) || '0', 10);
  if (version >= STORE_VERSION) return null;

  const weekPlan = (() => {
    const p = readJson('bh_week_plan', 'null');
    return (p && p.weekStart && p.sessions) ? p : null;
  })();
  const history  = readJson('bh_plan_history', '[]');
  const feedback = readJson('bh_session_feedback', '{}');

  const consumedFeedback = new Set();
  const coveredDays      = new Set();
  const counts = { sessions: 0, ratings: 0, skips: 0, unavailable: 0, seededWeeks: 0, unmatched: 0 };

  function mintFrom(dateKey, type, extra, record) {
    const { status, feedback: fb } = legacyStatus(record);
    createSession({ dateKey, type, origin: 'coach', status, feedback: fb, ...extra });
    coveredDays.add(dateKey);
    counts.sessions += 1;
    if (status === 'completed')   counts.ratings += 1;
    if (status === 'skipped')     counts.skips += 1;
    if (status === 'unavailable') counts.unavailable += 1;
    if (record) consumedFeedback.add(dateKey);
  }

  // Agreed week plan — Rest included: Rest is content now.
  if (weekPlan) {
    weekPlan.sessions.forEach(s => {
      const offset = DOW_OFFSETS[s.dayOfWeek];
      if (offset === undefined || !s.type) return;
      const dateKey = addDays(weekPlan.weekStart, offset);
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
      markDateUnavailable(dateKey);
      counts.unavailable += 1;
    } else {
      counts.unmatched += 1;
      console.warn(`Migration: unmatched feedback entry kept at ${dateKey}`, record);
    }
  });

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
