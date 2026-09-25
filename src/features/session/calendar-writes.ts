import type { Session } from './session';
import type { SessionConflict } from './conflict';
import { createdStatusFor } from './athlete-session-rules';

/**
 * The calendar's own writes, shown the moment they are made (showable-version/44).
 *
 * Before this, every move, add, edit and delete waited for the server and then
 * re-rendered the whole page — a second or more before the chip moved. Now the
 * calendar shows the write at once and the server's answer settles it.
 *
 * What the calendar renders is **derived**: `shownSessions(props, writes)`. It
 * never copies the props into state, so there is no moment where new props
 * "replace" what the calendar holds. That is what makes a write in flight safe
 * against a refresh that lands underneath it:
 *
 * - `inFlight` — writes sent and not answered. Their row always shows.
 * - `landed` — writes the server accepted. Each shows until the props carry
 *   that version of the row or a newer one, so props read before the write
 *   landed can never undo it. Status changes do not bump the version, so props
 *   holding the same version are the newer truth and win.
 */
export type Writes = {
  inFlight: Record<string, Session | null>;
  landed: Record<string, Session | null>;
  /** Rows this calendar created: shown even while the props do not hold them yet. */
  added: string[];
};

// An id in `added` with no in-flight or landed row behind it shows nothing.
// Stryker disable next-line ArrayDeclaration — equivalent: a seeded id is invisible, per the line above.
export const NO_WRITES: Writes = { inFlight: {}, landed: {}, added: [] };

export function shownSessions(props: Session[], writes: Writes): Session[] {
  const inProps = new Set(props.map((row) => row.id));
  const fromProps = props.flatMap((row) => present(overlay(row, writes)));
  const created = writes.added
    .filter((id) => !inProps.has(id))
    .flatMap((id) => present(writes.inFlight[id] ?? writes.landed[id]));
  // The server's order: by day, then by the order within the day.
  return [...fromProps, ...created].sort(
    (x, y) => x.date.localeCompare(y.date) || x.dayOrder - y.dayOrder,
  );
}

function overlay(row: Session, writes: Writes): Session | null {
  return row.id in writes.inFlight ? writes.inFlight[row.id] : newerOf(row, writes.landed[row.id]);
}

function present(row: Session | null | undefined): Session[] {
  return row ? [row] : [];
}

/**
 * The landed write while the props still predate it; the props once they catch
 * up. A landed deletion (`null`) always wins: ids are never reused, so props
 * that still hold the row can only be older than the delete.
 */
function newerOf(row: Session, landed: Session | null | undefined): Session | null {
  if (landed === undefined) return row;
  return landed && landed.version <= row.version ? row : landed;
}

/**
 * The sessions with a write in flight. One write per session at a time: the
 * chip will not lift and the drawer will not write until the first answers,
 * because a second write sends the version the first is about to replace. The
 * `begin*` functions refuse a second write on their own too.
 */
export function inFlightIds(writes: Writes): string[] {
  return Object.keys(writes.inFlight);
}

/** What the server said about one write. */
export type WriteOutcome =
  | { ok: true; version: number }
  | { ok: true; session: Session }
  // A delete: accepted, with nothing left to report.
  | { ok: true }
  | { ok: false; conflict?: SessionConflict };

/** Settles the write in flight under `key` with the server's answer. */
export function settle(writes: Writes, key: string, outcome: WriteOutcome): Writes {
  if (!(key in writes.inFlight)) return writes;
  const { [key]: sent, ...inFlight } = writes.inFlight;
  // A create: the placeholder's key gives way to the id the server chose.
  const kept = outcome.ok && 'session' in outcome ? outcome.session.id : key;
  return {
    inFlight,
    landed: { ...writes.landed, ...landing(key, sent, outcome) },
    added: writes.added.map((id) => (id === key ? kept : id)),
  };
}

/** What a settled write leaves behind to show until the props catch up. */
function landing(key: string, sent: Session | null, outcome: WriteOutcome): Writes['landed'] {
  // A conflict carries the row that won (or null: the winner deleted it), so
  // the calendar shows the truth without a reload. Any other refusal leaves
  // nothing: the props already hold the row as it was.
  if (!outcome.ok) return outcome.conflict ? { [key]: outcome.conflict.current } : {};
  if ('session' in outcome) return { [outcome.session.id]: outcome.session };
  if (!sent) return { [key]: null };
  return 'version' in outcome ? { [key]: { ...sent, version: outcome.version } } : {};
}

/** What the athlete typed into the create form, in the calendar's own fields. */
type SessionDraft = Pick<Session, 'date' | 'type' | 'duration' | 'isTraining' | 'note'>;

/**
 * Adds the athlete's new session at once, under a placeholder key, pending the
 * server's row. Status and order follow the server's own rules — completed on
 * or before today, last in its day — so the chip does not jump when the real
 * row replaces it.
 */
export function beginCreate(
  writes: Writes,
  shown: Session[],
  key: string,
  draft: SessionDraft,
  today: string,
): Writes {
  const sameDay = shown.filter((x) => x.date === draft.date).map((x) => x.dayOrder);
  const row: Session = {
    id: key,
    ...draft,
    status: createdStatusFor(draft.date, today),
    parked: false,
    dayOrder: Math.max(-1, ...sameDay) + 1,
    title: null,
    zone: null,
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    origin: 'athlete',
    version: 0,
  };
  return beginAdd(writes, row);
}

/**
 * Adds a session built elsewhere at once, under its own id as the key, pending
 * the server's row — the Head Coach's prescription, whose placeholder is built
 * by the same rule the server writes (`prescribedSessionOf`).
 */
export function beginAdd(writes: Writes, row: Session): Writes {
  return {
    ...writes,
    inFlight: { ...writes.inFlight, [row.id]: row },
    added: [...writes.added, row.id],
  };
}

/** Moves a session to `date` at once, pending the server's answer. */
export function beginMove(writes: Writes, shown: Session[], id: string, date: string): Writes {
  return beginEdit(writes, shown, id, { date });
}

/** Shows an edit to a session at once, pending the server's answer. */
export function beginEdit(
  writes: Writes,
  shown: Session[],
  id: string,
  patch: Partial<Session>,
): Writes {
  const row = shown.find((x) => x.id === id);
  if (!row || id in writes.inFlight) return writes;
  return { ...writes, inFlight: { ...writes.inFlight, [id]: { ...row, ...patch } } };
}

/** Removes a session at once, pending the server's answer. */
export function beginDelete(writes: Writes, id: string): Writes {
  if (id in writes.inFlight) return writes;
  return { ...writes, inFlight: { ...writes.inFlight, [id]: null } };
}
