import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { athlete, coach, coachingLink } from '@/db/schema';
import { user } from '@/db/auth-schema';
import { toCoach, type Coach, type RosterEntry } from './coach';
import type { LinkVisibility } from './link-visibility';

/** The placeholder shown when neither name source is present. */
export const UNKNOWN_ATHLETE = 'Unknown athlete';

/**
 * The one identity-resolution rule: a real athlete's name is `user.name`, a
 * synthetic one's is the fabricated `synthetic_label`, and a placeholder covers
 * the row that somehow has neither. Every read that names an athlete goes
 * through here so the rule lives in one place (ADR 0006 — identity reached only
 * through the user seam).
 */
export function resolveAthleteName(
  userName: string | null,
  syntheticLabel: string | null,
): string {
  return userName ?? syntheticLabel ?? UNKNOWN_ATHLETE;
}

/**
 * The only place the app reads the coach roster out of Postgres.
 *
 * Every read here is scoped to the coach resolved from the authenticated
 * session upstream, and to *active* links — a severed link revokes access by
 * construction, because no query returns its row (ADR 0006, ADR 0003).
 */

/** Resolves the coach a signed-in user owns, or undefined if they hold none. */
export async function getCoachByUserId(
  userId: string,
): Promise<Coach | undefined> {
  const rows = await getDb()
    .select()
    .from(coach)
    .where(eq(coach.userId, userId))
    .limit(1);

  return rows[0] ? toCoach(rows[0]) : undefined;
}

/**
 * The coach's Roster: every athlete they hold an active Coaching Link to.
 *
 * The athlete's name is resolved here — `user.name` for a real athlete (left
 * join through `athlete.user_id`), the fabricated `synthetic_label` for a
 * synthetic one — so callers never touch identity tables themselves. Ordered by
 * name for a stable roster.
 */
export async function getRoster(coachId: string): Promise<RosterEntry[]> {
  const rows = await getDb()
    .select({
      athleteId: athlete.id,
      userName: user.name,
      syntheticLabel: athlete.syntheticLabel,
      shareAthleteReports: coachingLink.shareAthleteReports,
      shareAiTranscripts: coachingLink.shareAiTranscripts,
    })
    .from(coachingLink)
    .innerJoin(athlete, eq(coachingLink.athleteId, athlete.id))
    .leftJoin(user, eq(athlete.userId, user.id))
    .where(
      and(eq(coachingLink.coachId, coachId), eq(coachingLink.status, 'active')),
    );

  return rows
    .map((r) => ({
      athleteId: r.athleteId,
      name: resolveAthleteName(r.userName, r.syntheticLabel),
      visibility: {
        shareAthleteReports: r.shareAthleteReports,
        shareAiTranscripts: r.shareAiTranscripts,
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The active Coaching Link between this coach and this athlete, or undefined
 * when there is none — no link, or a severed one.
 *
 * This is the authorization gate for the whole coach→athlete surface: a coach
 * with no active link to an athlete gets `undefined` here, and every caller
 * treats that as "not your athlete" and refuses. Because the check is a query
 * on the server, a forged athlete id in a request cannot pass it — the row
 * simply is not there (ticket 11: the forged request is refused server-side).
 */
export async function getActiveLink(
  coachId: string,
  athleteId: string,
): Promise<LinkVisibility | undefined> {
  const rows = await getDb()
    .select({
      shareAthleteReports: coachingLink.shareAthleteReports,
      shareAiTranscripts: coachingLink.shareAiTranscripts,
    })
    .from(coachingLink)
    .where(
      and(
        eq(coachingLink.coachId, coachId),
        eq(coachingLink.athleteId, athleteId),
        eq(coachingLink.status, 'active'),
      ),
    )
    .limit(1);

  return rows[0];
}

/**
 * The athlete name for a single roster member, resolved through the user seam.
 * Used by the athlete view's header; kept here so identity access stays in one
 * module. Returns undefined when the athlete does not exist.
 */
export async function getAthleteName(
  athleteId: string,
): Promise<string | undefined> {
  const rows = await getDb()
    .select({ userName: user.name, syntheticLabel: athlete.syntheticLabel })
    .from(athlete)
    .leftJoin(user, eq(athlete.userId, user.id))
    .where(eq(athlete.id, athleteId))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  return resolveAthleteName(row.userName, row.syntheticLabel);
}
