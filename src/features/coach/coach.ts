import type { CoachRow, CoachingLinkRow } from '@/db/schema';
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
 * A Coaching Link, as the app knows one — the athlete↔Head-Coach relationship
 * as a first-class domain object, not just the two flags it carries.
 *
 * A Head Coach is a *relationship, not a kind of person* (CONTEXT.md): someone
 * is a Head Coach only of the athletes their active links point at. Carrying
 * the link's identity and status (not only its `visibility`) lets callers reason
 * about the relationship itself — which link, active or severed — rather than
 * re-deriving it from loose booleans.
 *
 * `status` is narrowed to the closed set the schema check enforces, so an
 * unexpected stored value resolves to `severed` (fail-closed) rather than
 * leaking access.
 */
export type CoachingLink = {
  id: string;
  coachId: string;
  athleteId: string;
  status: 'active' | 'severed';
  visibility: LinkVisibility;
};

/** The one place a stored coaching-link row becomes a domain object. */
export function toCoachingLink(row: CoachingLinkRow): CoachingLink {
  return {
    id: row.id,
    coachId: row.coachId,
    athleteId: row.athleteId,
    // Fail closed: only an explicit 'active' is active; anything else is severed.
    status: row.status === 'active' ? 'active' : 'severed',
    visibility: {
      shareAthleteReports: row.shareAthleteReports,
      shareAiTranscripts: row.shareAiTranscripts,
    },
  };
}

/**
 * One athlete on a coach's Roster.
 *
 * `name` comes from better-auth's `user.name` for a real athlete, or the
 * fabricated `syntheticLabel` for a synthetic one — resolved at the repository
 * boundary so this shape never depends on which kind it is. `link` is the whole
 * Coaching Link, so the Roster can show what is shared (and reason about the
 * relationship) without a second read.
 */
export type RosterEntry = {
  athleteId: string;
  name: string;
  link: CoachingLink;
};
