import { howToFor, howToOf, type HowTo, type HowToSegment, type HowToView, type Zone } from '@/features/session/how-to';
import type { HowToSport } from '@/features/session/how-to-templates';
import type { ProposedSession } from '@/features/coach/weekly-session';
import type { Locale } from '@/i18n/routing';

/**
 * The Head Coach's review rows (`week-draft-review.tsx`), as plain data: a
 * draft's sessions in, the edited rows out as the approval sends them. Pure,
 * so the review's rules are tested and graded here rather than through a
 * rendered form.
 *
 * `training-architecture/26` added the how-to: each row carries the sport,
 * Momentum's reason for a changed sport and its cue as they were drafted, and
 * the coach's own how-to once they edit it (E6: the coach's text is final).
 * The server strips a cue or a reason the coach changed; the panel never
 * offers to change them.
 */
export interface DraftRow {
  key: number;
  date: string;
  type: string;
  durationMinutes: string;
  zone: string;
  note: string;
  sport: HowToSport | null;
  sportReason: string | null;
  cue: string | null;
  /** The coach's own how-to, or null while they have not edited it. */
  coachHowTo: HowTo | null;
}

export function rowsOf(sessions: readonly ProposedSession[]): DraftRow[] {
  return sessions.map((s, key) => ({
    key,
    date: s.date,
    type: s.type,
    durationMinutes: s.durationMinutes === null ? '' : String(s.durationMinutes),
    zone: s.zone ?? '',
    note: s.note ?? '',
    ...howToFieldsOf(s),
  }));
}

/** The draft's how-to fields, null where the draft had none. */
function howToFieldsOf(s: ProposedSession): Pick<DraftRow, 'sport' | 'sportReason' | 'cue' | 'coachHowTo'> {
  return { sport: s.sport ?? null, sportReason: s.sportReason ?? null, cue: s.cue ?? null, coachHowTo: s.coachHowTo ?? null };
}

/** A row the coach adds: the week's first day, the first type, nothing else. */
export function addedRow(key: number, date: string, type: string): DraftRow {
  return { key, date, type, durationMinutes: '', zone: '', note: '', sport: null, sportReason: null, cue: null, coachHowTo: null };
}

/**
 * The rows as the approval sends them. A field the draft did not have is left
 * off rather than sent empty, so an untouched draft compares equal to itself
 * on the server and is not reported to the athlete as the coach's work.
 */
export function toSessions(rows: readonly DraftRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    date: r.date,
    type: r.type,
    durationMinutes: minutesOf(r),
    zone: r.zone.trim() === '' ? null : r.zone,
    note: r.note.trim() === '' ? null : r.note,
    ...Object.fromEntries(
      Object.entries({ sport: r.sport, sportReason: r.sportReason, cue: r.cue, coachHowTo: r.coachHowTo }).filter(([, v]) => v !== null),
    ),
  }));
}

function minutesOf(row: DraftRow): number | null {
  return row.durationMinutes.trim() === '' ? null : Number(row.durationMinutes);
}

/** The how-to the card shows: the coach's own when they wrote one, else the template fitted to the row as it stands. */
export function howToOfRow(row: DraftRow, locale: Locale): HowToView | null {
  // An empty zone is no zone the how-to can use, so it takes the type's.
  return howToOf(
    { origin: 'coach', type: row.type, sport: row.sport, duration: minutesOf(row), zone: row.zone, howTo: { cue: row.cue, coach: row.coachHowTo } },
    locale,
  );
}

/**
 * What the coach starts editing from: the fitted template, with Momentum's cue
 * as the last focus line so keeping it is the default. Null for a row with no
 * how-to to start from (no minutes yet).
 */
export function startEditing(row: DraftRow, locale: Locale): HowTo | null {
  const fitted = howToFor({ type: row.type, sport: row.sport, durationMinutes: minutesOf(row), zone: row.zone }, locale);
  return fitted && { ...fitted, focus: row.cue ? [...fitted.focus, row.cue] : fitted.focus };
}

/** One segment field changed as the coach typed it. The server validates the result. */
export function withSegment(howTo: HowTo, index: number, field: 'minutes' | 'zone' | 'detail', value: string): HowTo {
  return {
    ...howTo,
    segments: howTo.segments.map((x, i) => (i === index ? { ...x, ...segmentField(field, value) } : x)),
  };
}

function segmentField(field: 'minutes' | 'zone' | 'detail', value: string): Partial<HowToSegment> {
  if (field === 'minutes') return { minutes: Number(value) };
  if (field === 'zone') return { zone: value as Zone };
  return { detail: value.trim() === '' ? null : value };
}

/** The focus cues as one text, a cue per line. */
export function focusText(howTo: HowTo): string {
  return howTo.focus.join('\n');
}

/**
 * The focus cues from that text, a line each, kept as typed: dropping a blank
 * line here would swallow the newline the coach just typed. The server drops
 * blank cues when it validates the how-to.
 */
export function withFocusText(howTo: HowTo, text: string): HowTo {
  return { ...howTo, focus: text.split('\n') };
}

/** The minutes the coach's segments add up to, shown against the session's. */
export function segmentMinutes(howTo: HowTo): number {
  return howTo.segments.reduce((t, x) => t + x.minutes, 0);
}
