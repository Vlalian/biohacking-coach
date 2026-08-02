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
  };
}
