import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { athlete, coach, coachingLink, conversations, messages } from '@/db/schema';
import { user } from '@/db/auth-schema';
import {
  toCoach,
  toCoachingLink,
  type AthleteCoachingLink,
  type Coach,
  type CoachingLink,
  type RosterEntry,
} from './coach';
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
      link: coachingLink,
      userName: user.name,
      syntheticLabel: athlete.syntheticLabel,
    })
    .from(coachingLink)
    .innerJoin(athlete, eq(coachingLink.athleteId, athlete.id))
    .leftJoin(user, eq(athlete.userId, user.id))
    .where(
      and(eq(coachingLink.coachId, coachId), eq(coachingLink.status, 'active')),
    );

  return rows
    .map((r) => ({
      athleteId: r.link.athleteId,
      name: resolveAthleteName(r.userName, r.syntheticLabel),
      link: toCoachingLink(r.link),
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
): Promise<CoachingLink | undefined> {
  const rows = await getDb()
    .select()
    .from(coachingLink)
    .where(
      and(
        eq(coachingLink.coachId, coachId),
        eq(coachingLink.athleteId, athleteId),
        eq(coachingLink.status, 'active'),
      ),
    )
    .limit(1);

  return rows[0] ? toCoachingLink(rows[0]) : undefined;
}

/**
 * The athlete's own active Coaching Link — what puts them in Coached Mode
 * (CONTEXT.md) — or undefined when they are solo (no link, or a severed one).
 *
 * Unlike {@link getActiveLink}, there is no coach id to scope by: the athlete
 * id resolved from their session upstream *is* the whole scope, so Settings
 * can only ever show and change the signed-in athlete's own relationship.
 *
 * `.limit(1)`: the product models one Head Coach relationship at a time (the
 * Settings brief's `coachingLink?:` is singular). The schema does not forbid
 * two simultaneous active links to different coaches, but nothing surfaces
 * more than one — ordered by newest first so that's the one shown if it ever
 * happens.
 */
export async function getLinkForAthlete(
  athleteId: string,
): Promise<AthleteCoachingLink | undefined> {
  const rows = await getDb()
    .select({ link: coachingLink, coachUserName: user.name })
    .from(coachingLink)
    .innerJoin(coach, eq(coachingLink.coachId, coach.id))
    .innerJoin(user, eq(coach.userId, user.id))
    .where(
      and(eq(coachingLink.athleteId, athleteId), eq(coachingLink.status, 'active')),
    )
    .orderBy(desc(coachingLink.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  return { headCoachName: row.coachUserName, link: toCoachingLink(row.link) };
}

/**
 * Updates the Link Visibility flags on the athlete's own active Coaching Link.
 *
 * The WHERE clause IS the authorization: scoped to `athleteId` and
 * `status = 'active'`, so this can only ever touch the signed-in athlete's own
 * live link — someone else's link, or their own severed one, matches no row
 * (ADR 0006). There is deliberately no flag for the always-on calendar
 * section (schema comment, `link-visibility.ts`) — only the two toggleable
 * flags are ever passed here.
 */
export async function updateLinkVisibility(
  athleteId: string,
  changes: Partial<LinkVisibility>,
): Promise<void> {
  await getDb()
    .update(coachingLink)
    .set(changes)
    .where(
      and(eq(coachingLink.athleteId, athleteId), eq(coachingLink.status, 'active')),
    );
}

/**
 * Severs the athlete's own active Coaching Link — cuts all access, including
 * history, from either side (CONTEXT.md). Keeps the row (`severedAt` records
 * when) so history survives; every read elsewhere already filters on
 * `status = 'active'`, so flipping the status alone revokes the Head Coach's
 * access. Scoped like {@link updateLinkVisibility}: an athlete can only sever
 * their own active link.
 */
export async function severLinkForAthlete(athleteId: string): Promise<void> {
  await getDb()
    .update(coachingLink)
    .set({ status: 'severed', severedAt: new Date() })
    .where(
      and(eq(coachingLink.athleteId, athleteId), eq(coachingLink.status, 'active')),
    );
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

/**
 * First names for a set of Head Coaches, keyed by coach id — the attribution
 * narration puts in the Coach's mouth ("Lars added a brick session Thursday",
 * CONTEXT.md).
 *
 * Keyed by **coach id, not by the athlete's current link**, because narration
 * names whoever actually acted. An athlete who severed one link and formed
 * another must not see the new coach's name on the old coach's change, and the
 * event carries the actor's id precisely so that stays possible.
 *
 * First name only: it is the register a coach is spoken about in, it matches
 * the CONTEXT.md example, and it is the smaller piece of identity to carry —
 * this string ends up in a stored transcript.
 *
 * A coach whose user row is missing is **absent from the result** rather than
 * mapped to a placeholder. The caller substitutes a neutral label, which reads
 * as coaching; a blank interpolated into "___ added a session Thursday" would
 * read as a bug, on a surface whose whole job is trust.
 */
export async function getCoachFirstNames(
  coachIds: string[],
): Promise<Record<string, string>> {
  if (coachIds.length === 0) return {};

  const rows = await getDb()
    .select({ coachId: coach.id, userName: user.name })
    .from(coach)
    .innerJoin(user, eq(coach.userId, user.id))
    .where(inArray(coach.id, coachIds));

  const names: Record<string, string> = {};
  for (const row of rows) {
    const first = row.userName?.trim().split(/\s+/)[0];
    if (first) names[row.coachId] = first;
  }
  return names;
}

/**
 * Persists the coach's roster-wide Information View layout (ONE layout across
 * the whole roster, ADR 0004). The value arrives validated — the
 * information-view feature owns what a legal layout is — and this is the write
 * seam, kept beside the other coach-row access. The read is not a separate
 * function: the coach's layout rides on the {@link Coach} object already.
 */
export async function updateCoachInformationViewLayout(
  coachId: string,
  layout: { favorites: string[]; range: string },
): Promise<void> {
  await getDb()
    .update(coach)
    .set({ informationViewLayout: layout, updatedAt: new Date() })
    .where(eq(coach.id, coachId));
}

/** The conversation kinds `share_ai_transcripts` governs — Coach Chat and the
 * Weekly Session. Other kinds (reflection, onboarding, negotiation) are not
 * part of the Link Visibility contract and are never served to a coach. */
const SHARED_TRANSCRIPT_KINDS = ['coach_chat', 'weekly_session'] as const;
type SharedTranscriptKind = (typeof SHARED_TRANSCRIPT_KINDS)[number];

/** A message role, as `messages.role`'s check constrains it. */
export type MessageRole = 'athlete' | 'coach_ai' | 'head_coach';

/** A conversation transcript shared with the coach, in `seq` order. */
export type SharedTranscript = {
  conversationId: string;
  kind: SharedTranscriptKind;
  createdAt: Date;
  messages: Array<{ role: MessageRole; content: string; seq: number }>;
};

/**
 * Coach Chat and Weekly Session transcripts for a linked athlete — served ONLY
 * when the link is active AND `share_ai_transcripts` is on. With the flag off,
 * a non-active link, or no link, this returns `null` *before any transcript row
 * is read*, so nothing exists to leak toward the client: Link Visibility is
 * enforced at the query, not hidden in the UI (ticket 11, ADR 0006).
 *
 * The kind filter is in the WHERE clause, so the non-shared conversation kinds
 * are never fetched either — the "never fetched when withheld" guarantee holds
 * per-kind, not just per-flag.
 *
 * The caller passes the already-resolved active link so the gate is checked
 * once, not twice.
 */
export async function getSharedTranscripts(
  link: CoachingLink | undefined,
): Promise<SharedTranscript[] | null> {
  if (!link || link.status !== 'active' || !link.visibility.shareAiTranscripts) {
    return null;
  }

  const rows = await getDb()
    .select({
      conversationId: conversations.id,
      kind: conversations.kind,
      createdAt: conversations.createdAt,
      role: messages.role,
      content: messages.content,
      seq: messages.seq,
    })
    .from(conversations)
    .innerJoin(messages, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.athleteId, link.athleteId),
        inArray(conversations.kind, [...SHARED_TRANSCRIPT_KINDS]),
      ),
    )
    .orderBy(asc(conversations.createdAt), asc(messages.seq));

  const byConversation = new Map<string, SharedTranscript>();
  for (const row of rows) {
    let entry = byConversation.get(row.conversationId);
    if (!entry) {
      entry = {
        conversationId: row.conversationId,
        kind: row.kind as SharedTranscriptKind,
        createdAt: row.createdAt,
        messages: [],
      };
      byConversation.set(row.conversationId, entry);
    }
    entry.messages.push({
      role: row.role as MessageRole,
      content: row.content,
      seq: row.seq,
    });
  }
  return [...byConversation.values()];
}
