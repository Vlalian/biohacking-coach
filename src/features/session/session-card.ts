import type { Session } from './session';
import type { SessionSport } from './session-sport';

/**
 * What a session looks like as a card on the Training Plan calendar
 * (`showable-version/37`, Mads 2026-09-19): every week expanded, each session
 * a card with an icon, its title, `duration · zone` and one line of its note.
 *
 * Pure: a session in, what the card shows out. The component draws it.
 */

/**
 * The card's treatment. One each, so the athlete tells them apart at a glance:
 *
 * - `arithmetic` — the block structure's own fill (`training-architecture/34`),
 *   not yet replaced by a Coach's week: dashed, the stripe faded.
 * - `accepted` — the plan: the Coach's week, the Head Coach's prescription, the
 *   athlete's own session. Solid.
 * - `done` — completed. Muted fill, a check.
 * - `proposed` — a drafted week drawn on the grid: a ghost. Nothing feeds it
 *   today — a proposal lives in the card above the grid only
 *   (`training-architecture/25`) — but the treatment is defined for when one is.
 * - `missed` — skipped or unavailable: struck through.
 */
export type CardState = 'done' | 'accepted' | 'arithmetic' | 'athlete' | 'proposed' | 'missed';

/** The status decides first — a completed arithmetic session is done — and then who wrote it. */
export function cardState(session: Pick<Session, 'status' | 'origin'>): CardState {
  if (session.status === 'completed') return 'done';
  if (session.status === 'skipped' || session.status === 'unavailable') return 'missed';
  if (session.origin === 'arithmetic') return 'arithmetic';
  return session.origin === 'athlete' ? 'athlete' : 'accepted';
}

/** Who is looking at the calendar: the athlete, or a Head Coach reading it. */
export type CardViewer = 'athlete' | 'head_coach';

/** The `Calendar` catalogue key for a card's author line, and the name it fills. */
export type AuthorLabel =
  | { key: 'authorYou' }
  | { key: 'authorNamed'; name: string }
  | { key: 'authorAthlete' };

/**
 * The screen-reader line that says whose session an athlete-authored card is:
 * "Your session" to the athlete, "{name}'s session" to a Head Coach, or "The
 * athlete's session" when the athlete has no name. Null for every other origin.
 */
export function authorLabel(
  session: Pick<Session, 'origin'>,
  { viewer, athleteName }: { viewer: CardViewer; athleteName: string | null },
): AuthorLabel | null {
  if (session.origin !== 'athlete') return null;
  if (viewer === 'athlete') return { key: 'authorYou' };
  const name = athleteName?.trim();
  return name ? { key: 'authorNamed', name } : { key: 'authorAthlete' };
}

/** The lucide icon names a card can carry. Checked against `lucide-react` 1.25. */
export type CardIcon =
  | 'Waves'
  | 'Bike'
  | 'Footprints'
  | 'BrickWall'
  | 'Dumbbell'
  | 'StretchHorizontal'
  | 'Shapes'
  | 'Circle';

/**
 * The icon for each sport: the seven of `SESSION_SPORTS`, plus the Garmin
 * labels `build-dataset.ts` already reads the same way, folded into them.
 */
const SPORT_ICON = new Map<string, CardIcon>(Object.entries({
  swim: 'Waves',
  swimming: 'Waves',
  open_water: 'Waves',
  lap_swimming: 'Waves',
  bike: 'Bike',
  cycling: 'Bike',
  biking: 'Bike',
  virtual_ride: 'Bike',
  run: 'Footprints',
  running: 'Footprints',
  trail_running: 'Footprints',
  treadmill_running: 'Footprints',
  brick: 'BrickWall',
  strength: 'Dumbbell',
  strength_training: 'Dumbbell',
  mobility: 'StretchHorizontal',
  misc: 'Shapes',
}) as [string, CardIcon][]);

const ICON_SPORT: Partial<Record<CardIcon, SessionSport>> = {
  Waves: 'swim',
  Bike: 'bike',
  Footprints: 'run',
  BrickWall: 'brick',
  Dumbbell: 'strength',
  StretchHorizontal: 'mobility',
  Shapes: 'misc',
};

/** The sport the card's icon stands for, so the icon can be named; null for `Circle`. */
export function cardSport(session: Pick<Session, 'sport'>): SessionSport | null {
  return ICON_SPORT[cardIcon(session)] ?? null;
}

/** The sport's icon, else a plain circle. The Session Type is colour, never an icon. */
export function cardIcon(session: Pick<Session, 'sport'> & { type?: string }): CardIcon {
  // A Map, not an object literal: a file label such as "constructor" must not
  // read an inherited property off Object.prototype.
  return (session.sport ? SPORT_ICON.get(session.sport.toLowerCase()) : undefined) ?? 'Circle';
}

/** The card's three lines of text. `meta` holds only the parts the session has. */
export interface CardLines {
  title: string;
  /** The duration in minutes (unit added by the renderer) and the zone, each only when present. */
  meta: string[];
  /** The note's first non-blank line, or null. */
  note: string | null;
}

/**
 * The card's text. A missing field is left out, never replaced by a
 * placeholder — "— min" teaches the athlete that the plan forgot something.
 * A zero duration is as absent as a null one, as it was on the chip.
 */
export function cardLines(session: Pick<Session, 'title' | 'type' | 'duration' | 'zone' | 'note'>): CardLines {
  const zone = session.zone?.trim();
  const meta = [session.duration ? String(session.duration) : null, zone || null].filter(
    (part): part is string => part !== null,
  );
  return { title: session.title ?? session.type, meta, note: firstLine(session.note) };
}

/** The first line of a note that has something on it, trimmed; null for none. */
function firstLine(note: string | null): string | null {
  return (note ?? '').split('\n').map((line) => line.trim()).find(Boolean) ?? null;
}
