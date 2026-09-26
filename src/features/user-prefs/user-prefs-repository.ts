import { eq, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { user } from '@/db/auth-schema';
import { athlete } from '@/db/schema';

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
  /**
   * What the athlete chose for the Coach to call them (`preferred-name/02`).
   * Identity-side for the same reason the language is: it is the person's
   * preference, not training data, and it is never derived from `user.name`.
   * Absent when they left the field blank — the Coach is then nameless.
   */
  preferredName?: string;
  /**
   * Set once a Head Coach has been shown the week cycle in full and dismissed
   * it (`training-architecture/41`). Per user, not per athlete: the cycle is the
   * same for everyone they coach, so it is taught once. Absent means never
   * instructed — there is no `false`.
   */
  weekCycleInstructed?: true;
}

export async function getUiPrefs(userId: string): Promise<UiPrefs> {
  const rows = await getDb()
    .select({ uiPrefs: user.uiPrefs })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return (rows[0]?.uiPrefs as UiPrefs | null) ?? {};
}

/**
 * The one write in this module: a single statement that changes the prefs
 * Postgres holds right now.
 *
 * Read-modify-write in JavaScript lost whichever of two concurrent writes
 * finished second — two settings pages open, or a coach dismissing the week
 * cycle while a language change was in flight, and one of them vanished
 * (CodeRabbit, PR #102). `neon-http` has no transactions, so the merge belongs
 * in the statement rather than around it.
 */
async function writeUiPrefs(userId: string, change: SQL): Promise<void> {
  await getDb().update(user).set({ uiPrefs: change }).where(eq(user.id, userId));
}

/** One preference, merged over whatever else is stored, inside the database. */
async function patchUiPrefs(userId: string, patch: UiPrefs): Promise<void> {
  await writeUiPrefs(
    userId,
    sql`coalesce(${user.uiPrefs}, '{}'::jsonb) || ${sql.param(JSON.stringify(patch))}::jsonb`,
  );
}

/** One preference removed, leaving the rest as they are. */
async function removeUiPref(userId: string, key: keyof UiPrefs): Promise<void> {
  await writeUiPrefs(userId, sql`coalesce(${user.uiPrefs}, '{}'::jsonb) - ${sql.param(key)}`);
}

/** Sets the chosen language, merging over any other stored prefs. */
export async function setUiLanguage(userId: string, language: string): Promise<void> {
  await patchUiPrefs(userId, { language });
}

/** Records that this user has seen the week cycle, merging over any other stored prefs. */
export async function setWeekCycleInstructed(userId: string): Promise<void> {
  await patchUiPrefs(userId, { weekCycleInstructed: true });
}

/**
 * Sets or clears the Preferred Name, merging over any other stored prefs.
 * `null` removes the key rather than storing an empty value, so "never set"
 * and "cleared" read the same everywhere downstream.
 */
export async function setPreferredName(
  userId: string,
  preferredName: string | null,
): Promise<void> {
  // Clearing removes the key, which a merge cannot express — hence the two paths.
  if (preferredName === null) await removeUiPref(userId, 'preferredName');
  else await patchUiPrefs(userId, { preferredName });
}

/**
 * The Preferred Name of an athlete the caller does not *own* — the Coach
 * Briefing reaches an athlete it is linked to, so it holds the opaque athlete
 * id and not the user. Joined through the user seam here rather than by
 * widening {@link import('@/features/athlete/athlete').Athlete}, which carries
 * no identity by design (ADR 0006). Null when none was set, and for a synthetic
 * athlete with no user row at all.
 */
export async function getPreferredNameForAthlete(athleteId: string): Promise<string | null> {
  return (await uiPrefsForAthlete(athleteId))?.preferredName ?? null;
}

/**
 * The Athlete Language of an athlete, by athlete id (showable-version/46) —
 * for the Coach's background calls, which hold the athlete and not a session:
 * the week draft runs from the athlete's own app-open *and* from their Head
 * Coach's, so the language cannot come from whoever is signed in. Null when
 * none was set (the Coach then writes English), and for a synthetic athlete.
 */
export async function getLanguageForAthlete(athleteId: string): Promise<string | null> {
  return (await uiPrefsForAthlete(athleteId))?.language ?? null;
}

/** One athlete's prefs, joined through the user seam; null with no user row or no prefs. */
async function uiPrefsForAthlete(athleteId: string): Promise<UiPrefs | null> {
  const rows = await getDb()
    .select({ uiPrefs: user.uiPrefs })
    .from(athlete)
    .innerJoin(user, eq(user.id, athlete.userId))
    .where(eq(athlete.id, athleteId))
    .limit(1);
  return (rows[0]?.uiPrefs as UiPrefs | null) ?? null;
}
