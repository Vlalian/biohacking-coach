import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { user } from '@/db/auth-schema';

/**
 * UI preferences on the better-auth user — the one place the app reads or
 * writes `ui_prefs` (ticket 05 placed the language on the user; ticket 09 chose
 * the JSONB mechanism).
 *
 * A preference is identity-side data: it travels with the person, not the
 * training history, so it lives in the auth table and is reached by `userId`.
 * The Coach reads the language through this seam and passes it into the
 * check-in as plain data — the training tables never store it.
 */

export interface UiPrefs {
  /** UI + Coach locale code: 'en' | 'da'. */
  language?: string;
}

export async function getUiPrefs(userId: string): Promise<UiPrefs> {
  const rows = await getDb()
    .select({ uiPrefs: user.uiPrefs })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return (rows[0]?.uiPrefs as UiPrefs | null) ?? {};
}

/** Sets the chosen language, merging over any other stored prefs. */
export async function setUiLanguage(
  userId: string,
  language: string,
): Promise<void> {
  const current = await getUiPrefs(userId);
  await getDb()
    .update(user)
    .set({ uiPrefs: { ...current, language } })
    .where(eq(user.id, userId));
}
