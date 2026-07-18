import type { SessionRow } from '@/db/schema';

/**
 * A session, as the calendar knows one.
 *
 * Narrower than the stored row: it carries what the read-only calendar renders
 * today — the dot (type + status) and the day's detail (title, duration, zone,
 * note) — not the authority, feedback, or Garmin columns that later slices read.
 * A field arrives here when something renders it.
 *
 * `date` is a 'YYYY-MM-DD' string; `dayOrder` orders sessions within that date.
 */
export type Session = {
  id: string;
  date: string;
  type: string;
  status: string;
  dayOrder: number;
  title: string | null;
  duration: number | null;
  zone: string | null;
  note: string | null;
};

/** The one place a stored session row becomes a domain object. */
export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    status: row.status,
    dayOrder: row.dayOrder,
    title: row.title,
    duration: row.duration,
    zone: row.zone,
    note: row.note,
  };
}
