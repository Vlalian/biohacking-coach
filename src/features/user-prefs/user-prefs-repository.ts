import { eq } from 'drizzle-orm';
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

/** The whole prefs object, as stored — the one write in this module. */
async function writeUiPrefs(userId: string, prefs: UiPrefs): Promise<void> {
  await getDb().update(user).set({ uiPrefs: prefs }).where(eq(user.id, userId));
}

/**
 * One preference, merged over whatever else is stored. Every setter that only
 * adds a key goes through here, so the merge rule is written once rather than
 * once per preference — a setter that forgot to spread would silently drop the
 * others.
 */
async function patchUiPrefs(userId: string, patch: UiPrefs): Promise<void> {
  await writeUiPrefs(userId, { ...(await getUiPrefs(userId)), ...patch });
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
  const next: UiPrefs = { ...(await getUiPrefs(userId)) };
  if (preferredName === null) delete next.preferredName;
  else next.preferredName = preferredName;
  // Not `patchUiPrefs`: clearing removes the key, and a patch can only add one.
  await writeUiPrefs(userId, next);
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
  const rows = await getDb()
    .select({ uiPrefs: user.uiPrefs })
    .from(athlete)
    .innerJoin(user, eq(user.id, athlete.userId))
    .where(eq(athlete.id, athleteId))
    .limit(1);
  return (rows[0]?.uiPrefs as UiPrefs | null)?.preferredName ?? null;
}
