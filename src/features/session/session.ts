import type { SessionRow } from '@/db/schema';

/**
 * Who authored a session. A closed set, enforced at the database by the
 * `sessions_origin_valid` check constraint — mirrored here so the authority
 * checks that branch on it (only `'athlete'` content is athlete-editable) are
 * exhaustively typed rather than comparing against open strings.
 *
 * `arithmetic` is the structure's own (`training-architecture/34`): rows the
 * block arithmetic wrote so the calendar is full beyond this week. They are
 * the plan, not the athlete's — the Head Coach edits and moves them, the
 * athlete does not — and the Coach's weekly draft replaces them as it lands.
 */
export const SESSION_ORIGINS = ['coach', 'athlete', 'garmin', 'head_coach', 'arithmetic'] as const;
export type SessionOrigin = (typeof SESSION_ORIGINS)[number];

/** Narrows a stored `origin` column to the closed set, so authority checks
 *  compare against the union rather than an open string. */
export function toSessionOrigin(value: string): SessionOrigin {
  return (SESSION_ORIGINS as readonly string[]).includes(value)
    ? (value as SessionOrigin)
    : 'coach';
}

/**
 * What a device recorded for a session, as far as anything renders it: the
 * distance and average heart rate a Garmin file carried
 * (`garmin-integration/07`). Either may be missing — a pool swim has no GPS,
 * a watch without a strap no heart rate.
 */
export type DeviceSummary = { distanceM: number | null; avgHr: number | null };

/** `Number.isFinite` never coerces, so a string or null is not finite. */
function finiteOrNull(value: unknown): number | null {
  return Number.isFinite(value) ? (value as number) : null;
}

/** Narrows the stored `summary` JSONB to the facts a session shows. A value
 *  that is not an object, or an object holding neither fact, is no summary. */
// Export-for-test: reaching each stored JSONB shape through `toSession` needs a
// full SessionRow per case. Delete freely if this is inlined into `toSession`.
export function toDeviceSummary(value: unknown): DeviceSummary | null {
  if (value === null || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const summary = { distanceM: finiteOrNull(raw.distanceM), avgHr: finiteOrNull(raw.avgHr) };
  return summary.distanceM === null && summary.avgHr === null ? null : summary;
}

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
  /** The discipline, where one is known: a Garmin import's raw sport
   *  (`cycling`, `running` …) or the arithmetic's `swim`/`bike`/`run`/`brick`.
   *  Null on a session the Coach, the athlete or the Head Coach wrote. The
   *  card picks its icon by it (`showable-version/37`). */
  sport: string | null;
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
  /** What the device recorded, on a session that came from one; null on
   *  everything the app itself wrote. */
  summary: DeviceSummary | null;
  /** The row version this view was read at. A write sends it back so a change
   *  that landed in between is refused rather than overwritten
   *  (`versioned-write.ts`). Rendered by nothing; carried by every editor. */
  version: number;
};

/**
 * Imported history (`garmin-integration/07`): a session a History Upload wrote
 * as completed training. History Upload is the only writer of origin `garmin`,
 * and it writes no feedback by design — so such a session needs no rating and
 * is never an unrated reflection. A Detected Activity accepted onto a Planned
 * Session keeps its own origin and still asks for one.
 */
export function isImportedHistory(session: Pick<Session, 'origin' | 'status'>): boolean {
  return session.origin === 'garmin' && session.status === 'completed';
}

/**
 * A past Planned Session nobody recorded (`training-architecture/45`): its day
 * is behind today and it was never completed or skipped. The row is left as it
 * is — nothing writes a status for it — and the Coach reads it as "not
 * recorded" rather than as a plan still to come. Today's session is not past.
 */
export function isUnrecorded(session: Pick<Session, 'status' | 'date'>, today: string): boolean {
  return session.status === 'planned' && session.date < today;
}

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
    sport: row.sport,
    feedbackBody: row.feedbackBody,
    feedbackMind: row.feedbackMind,
    feedbackComment: row.feedbackComment,
    // The database's check constraint is what makes this cast safe: no row can
    // hold a value outside SESSION_ORIGINS.
    origin: toSessionOrigin(row.origin),
    isTraining: row.isTraining,
    summary: toDeviceSummary(row.summary),
    version: row.version,
  };
}
