import type { CoachRow } from '@/db/schema';
import type { LinkVisibility } from './link-visibility';

/**
 * A coach, as the app knows one.
 *
 * Narrower than the stored row, like every domain object here. There is no
 * name: a coach always has a login, so their name is `user.name`, reached
 * through the user seam — this object is deliberately usable without it (route
 * 06, ADR 0006).
 *
 * `informationViewLayout` is the ONE panel layout the coach applies across
 * their whole roster (ADR 0004); still untyped here because the information-view
 * feature owns its parsing.
 */
export type Coach = {
  id: string;
  informationViewLayout: unknown;
};

/** The one place a stored coach row becomes a domain object. */
export function toCoach(row: CoachRow): Coach {
  return {
    id: row.id,
    informationViewLayout: row.informationViewLayout,
  };
}

/**
 * One athlete on a coach's Roster.
 *
 * `name` comes from better-auth's `user.name` for a real athlete, or the
 * fabricated `syntheticLabel` for a synthetic one — resolved at the repository
 * boundary so this shape never depends on which kind it is. `visibility` is the
 * link's own flags, embedded rather than re-flattened, so the Roster can show
 * what is shared without a second read and the two booleans travel as one type.
 */
export type RosterEntry = {
  athleteId: string;
  name: string;
  visibility: LinkVisibility;
};
