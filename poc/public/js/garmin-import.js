// Garmin import — turns parsed upload-endpoint sessions into store entities.
// Entities get origin 'garmin': device-recorded facts are read-only by
// construction (every edit/delete guard requires origin 'athlete'). Streams
// live OUTSIDE bh_sessions — one key per session — so the hot entity path
// never pays the stream weight.

import { allSessions, createSession, updateSession, sessionsForDay, getDateKey, streamKey, setStreams, getStreams } from './store.js';
import { render as renderCalendar } from './calendar.js';
import { showSessionFeedbackPrompt } from './feedback.js';
import { t } from './translations.js';

export { streamKey, getStreams };

// A workout merges with the plan instead of duplicating it: prefer a same-type
// Planned Session on its date, else the earliest by dayOrder. Parked sessions
// (Rest dominance) are never matched. matchedIds keeps one upload from
// completing the same planned session twice within a batch.
function findPlannedMatch(p, matchedIds) {
  const candidates = sessionsForDay(p.date)
    .filter(s => s.status === 'planned' && !s.parked && !matchedIds.has(s.id))
    .sort((a, b) => a.dayOrder - b.dayOrder);
  return candidates.find(s => s.type === p.sessionType) || candidates[0] || null;
}

// parsed = session objects from POST /api/garmin/upload.
// Dedup: exact startTime match against existing imported entities → skipped.
export function importParsedSessions(parsed) {
  const known = new Set(
    allSessions().filter(s => s.source === 'garmin' && s.startTime).map(s => s.startTime)
  );
  const imported = [];
  const matchedIds = new Set();
  let skipped = 0;

  for (const p of parsed || []) {
    if (!p.date || !p.startTime) continue;
    if (known.has(p.startTime)) { skipped++; continue; }
    known.add(p.startTime);

    const match = findPlannedMatch(p, matchedIds);
    let entity;
    if (match) {
      // Complete the planned session in place: id, origin, Coach note and zone
      // survive; the actual recorded duration replaces the planned one.
      entity = updateSession(match.id, {
        status:    'completed',
        duration:  p.duration != null ? `${p.duration} min` : match.duration,
        source:    'garmin',
        startTime: p.startTime,
        sport:     p.sport || null,
        summary:   p.summary || null,
      });
      matchedIds.add(match.id);
    } else {
      entity = createSession({
        dateKey:   p.date,
        type:      p.sessionType || 'Endurance',
        origin:    'garmin',
        status:    'completed',
        duration:  p.duration != null ? `${p.duration} min` : null,
        zone:      null,
        note:      p.note || null,
        source:    'garmin',
        startTime: p.startTime,
        sport:     p.sport || null,
        summary:   p.summary || null,
      });
    }

    if (p.streams?.t?.length) setStreams(entity.id, p.streams);
    imported.push(entity);
  }

  return { imported, skipped };
}

// Rating chain: the real version of simulateWorkoutComplete. Exactly one
// imported workout dated today or yesterday → offer the blank rating popup.
// Bulk backfills never chain popups; those get rated from the calendar.
export function pickRatingCandidate(imported, todayKey) {
  const yesterdayKey = getDateKey(new Date(new Date(todayKey + 'T00:00:00').getTime() - 86400000));
  const recent = (imported || []).filter(e => e.dateKey === todayKey || e.dateKey === yesterdayKey);
  return recent.length === 1 ? recent[0] : null;
}

// ── UI handler (Training Plan view) ──────────────────────────────────────────

export async function uploadWorkoutFiles(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  const result = document.getElementById('tpUploadResult');
  if (result) result.textContent = t('tpUploading');

  try {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    const res  = await fetch('/api/garmin/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'upload failed');

    const { imported, skipped } = importParsedSessions(data.sessions || []);
    if (result) {
      result.textContent = t('tpUploadResult')
        .replace('{n}', imported.length)
        .replace('{m}', skipped);
    }
    renderCalendar();

    const candidate = pickRatingCandidate(imported, getDateKey(new Date()));
    if (candidate) {
      showSessionFeedbackPrompt(candidate, renderCalendar, { preload: false });
    }
  } catch {
    if (result) result.textContent = t('tpUploadFailed');
  } finally {
    input.value = '';
  }
}
