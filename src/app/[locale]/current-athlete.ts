import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';
import { getUiPrefs } from '@/features/user-prefs/user-prefs-repository';
import type { Athlete } from '@/features/athlete/athlete';

/**
 * Resolving "who is acting" for a server action — one implementation, shared.
 *
 * Every action in this route group needs the same first step: read the
 * authenticated session, map it to an athlete, and refuse if either is absent.
 * The client sends what it wants done, never who it is (ADR 0006); these
 * helpers are the authentication half, and the feature services then check the
 * ids they were handed against that owner (the authority half).
 *
 * Three shapes because callers genuinely need three: most actions want only the
 * opaque athlete id; Settings needs the whole athlete row, because it reads the
 * current profile before writing the next one; and the Coach actions also need
 * the athlete's language to render a prompt in. Marked `server-only` so an
 * accidental client import fails at build rather than shipping `auth` to the
 * browser.
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
