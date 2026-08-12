import type { SessionRow } from '@/db/schema';

/**
 * A session, as the calendar knows one.
 *
 * Narrower than the stored row: it carries what the calendar renders today — the
 * dot (type + status), the day's detail (title, duration, zone, note), and a
 * completed session's feedback so a rating can be shown and pre-filled — not the
 * authority or Garmin columns that later slices read. A field arrives here when
 * something renders it.
 *
 * `date` is a 'YYYY-MM-DD' string; `dayOrder` orders sessions within that date.
 * `parked` is true while the session is an Unavailable session — flipped out of
 * the plan in place (its `status` is 'unavailable') and awaiting re-placement;
 * the calendar surfaces it so the athlete can retrieve it. The feedback fields
 * are the Session Reflection (RPE 1–5 for body and mind plus a comment); null
 * until the athlete rates the session.
 */
/**
 * Who authored a session. A closed set, enforced at the database by the
 * `sessions_origin_valid` check constraint — mirrored here so the authority
 * checks that branch on it (only `'athlete'` content is athlete-editable) are
 * exhaustively typed rather than comparing against open strings.
 */
export const SESSION_ORIGINS = ['coach', 'athlete', 'garmin', 'head_coach'] as const;
export type SessionOrigin = (typeof SESSION_ORIGINS)[number];

export type Session = {
  id: string;
  date: string;
  type: string;
  status: string;
  parked: boolean;
  dayOrder: number;
  title: string | null;
  duration: number | null;
  zone: string | null;
  note: string | null;
  feedbackBody: number | null;
  feedbackMind: number | null;
  feedbackComment: string | null;
  /** Who authored it — 'athlete' is the only origin whose content (type/note/
   *  duration) the athlete may edit or delete; every other origin is read-only
   *  content for them (CONTEXT.md, Prescribed Session). */
  origin: SessionOrigin;
  /** Whether it counts as training load (Athlete Session's Other-as-training
   *  toggle) — governs Double/Rest-day placement rules on the calendar. */
  isTraining: boolean;
};

/** The one place a stored session row becomes a domain object. */
export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    status: row.status,
    parked: row.parked,
    dayOrder: row.dayOrder,
    title: row.title,
    duration: row.duration,
    zone: row.zone,
    note: row.note,
    feedbackBody: row.feedbackBody,
    feedbackMind: row.feedbackMind,
    feedbackComment: row.feedbackComment,
    // The database's check constraint is what makes this cast safe: no row can
    // hold a value outside SESSION_ORIGINS.
    origin: row.origin as SessionOrigin,
    isTraining: row.isTraining,
  };
}
