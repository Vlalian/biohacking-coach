import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { getCoachByUserId } from '@/features/coach/coach-repository';
import { getUiPrefs } from '@/features/user-prefs/user-prefs-repository';
import type { Athlete } from '@/features/athlete/athlete';

/**
 * Resolving "who is acting" for a server action — one implementation, shared.
 *
 * Every action needs the same first step: read the authenticated session, map it
 * to whichever capacity the action belongs to, and refuse if either is absent.
 * The client sends what it wants done, never who it is (ADR 0006); these helpers
 * are the authentication half, and the feature services then check the ids they
 * were handed against that owner (the authority half).
 *
 * Both capacities live here rather than in two modules, because they are two
 * capacities of one account: a Head Coach is a relationship, not a kind of person
 * (CONTEXT.md), and the same person may hold a Roster and train as an athlete.
 * An action picks the capacity it acts in; nothing here assumes they are
 * exclusive.
 *
 * Several shapes because callers genuinely need several: most actions want only
 * the opaque id; Settings needs the whole athlete row, because it reads the
 * current profile before writing the next one; the Coach actions also need the
 * language to render a prompt in; and a couple of writes belong to the user
 * rather than to either capacity. Marked `server-only` so an accidental client
 * import fails at build rather than shipping `auth` to the browser.
 */

/** The failure these helpers return, shaped like every other action result. */
export type AuthFailure = { ok: false; reason: 'not-authenticated' };

/** Just the opaque athlete id, or null when signed out / unprovisioned. */
export async function resolveAthleteId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const athlete = await getAthleteByUserId(session.user.id);
  return athlete?.id ?? null;
}

/**
 * The whole athlete row, or null when signed out / unprovisioned.
 *
 * What an action needs when the *current* value is part of the next write —
 * Fixed Constraints reads the existing list before appending to it, since the
 * JSONB merge replaces the whole array.
 */
export async function resolveAthlete(): Promise<Athlete | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return (await getAthleteByUserId(session.user.id)) ?? null;
}

/**
 * The athlete plus their chosen language — what the Coach actions need. The
 * language lives on the user (`ui_prefs`), not in training data, so it is read
 * through the user seam and passed onward as plain data.
 */
export async function resolveAthleteWithLanguage(): Promise<
  { ok: true; athlete: Athlete; language?: string } | AuthFailure
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, reason: 'not-authenticated' };
  const athlete = await getAthleteByUserId(session.user.id);
  if (!athlete) return { ok: false, reason: 'not-authenticated' };
  const prefs = await getUiPrefs(session.user.id);
  return { ok: true, athlete, language: prefs.language };
}

/**
 * Just the signed-in user id, or null when signed out.
 *
 * For the few writes that belong to the *user* rather than to either of their
 * capacities — the UI language lives in `ui_prefs`, keyed by user, because it is
 * a preference of the person, not of their training data (ADR 0006).
 */
export async function resolveUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/**
 * The Head Coach a signed-in user *is* — or null when they hold no coach row.
 *
 * A Head Coach is a relationship, not a kind of person (CONTEXT.md): the same
 * account can hold a Roster and train as an athlete, so this resolves that
 * capacity independently of {@link resolveAthleteId}. Holding no coach row is
 * not an error, it is the normal case for a solo athlete — the caller decides
 * what to do about it.
 *
 * Named for the human, per the glossary: "Coach" is the AI agent, "Head Coach"
 * is the person. The repository call it wraps (`getCoachByUserId`) and the table
 * it reads are both still spelled `coach`; renaming those is a wider change than
 * this one and is filed separately.
 */
export async function resolveHeadCoachId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const coach = await getCoachByUserId(session.user.id);
  return coach?.id ?? null;
}

/**
 * The failure the Head-Coach-side actions return when the caller holds no Roster.
 * The `reason` string is the pre-existing wire value the UI already switches on,
 * so it keeps its spelling.
 */
export type NotAHeadCoach = { ok: false; reason: 'not-a-coach' };

/**
 * The Head Coach plus their chosen language — what the Coach Briefing actions
 * need. Same shape and same reasoning as {@link resolveAthleteWithLanguage}: the
 * language is read through the user seam and passed onward as plain data.
 */
export async function resolveHeadCoachWithLanguage(): Promise<
  { ok: true; coachId: string; language?: string } | NotAHeadCoach
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, reason: 'not-a-coach' };
  const coach = await getCoachByUserId(session.user.id);
  if (!coach) return { ok: false, reason: 'not-a-coach' };
  const prefs = await getUiPrefs(session.user.id);
  return { ok: true, coachId: coach.id, language: prefs.language };
}
