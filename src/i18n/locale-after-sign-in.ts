/**
 * Which locale the sign-in form lands on once the session exists: the language
 * the athlete chose in onboarding or Settings (`ui_prefs.language`) when it is
 * one the app has, else the locale of the page they signed in on. Detection is
 * off in the routing config (showable-version/34), so this is the only place a
 * returning athlete's stored language is applied.
 */
export function localeAfterSignIn(
  stored: string | null | undefined,
  current: string,
  locales: readonly string[],
): string {
  return stored && locales.includes(stored) ? stored : current;
}
