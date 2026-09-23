'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getUiPrefs } from '@/features/user-prefs/user-prefs-repository';

/**
 * The language the signed-in user chose in onboarding or Settings, or null when
 * none is stored or nobody is signed in. The sign-in form calls this right after
 * the session exists and lands on that locale (showable-version/34): locale
 * detection is off, so nothing else applies a returning athlete's language.
 */
export async function preferredLocaleAction(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { language } = await getUiPrefs(session.user.id);
  return language ?? null;
}
