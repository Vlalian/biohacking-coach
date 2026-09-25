import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getAthleteByUserId } from '@/features/athlete/athlete-repository';

/**
 * The signed-in session and athlete, read **once per render** (`code-health/09`).
 *
 * The (app) layout and the page under it both need them, and before this each
 * asked the database again — two round trips per page that bought nothing.
 * React's `cache()` scopes the memo to one server request, so a second call in
 * the same render reuses the first's promise, and nothing leaks between users.
 *
 * Redirects stay with the callers: this only reads. A signed-out visitor gets
 * `null` here and the layout or page decides what to do with it.
 */
export const getCurrentSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/** The signed-in user's athlete row, or undefined when signed out or unprovisioned. */
export const getCurrentAthlete = cache(async () => {
  const session = await getCurrentSession();
  return session ? getAthleteByUserId(session.user.id) : undefined;
});
