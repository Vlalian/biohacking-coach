/**
 * Which locale a signed-in athlete is sent on in: the language they chose in
 * onboarding or Settings (`ui_prefs.language`) when it is one the app has,
 * else the locale of the URL they arrived on. Detection is off in the routing
 * config (showable-version/34), so the gate page's redirect, which applies
 * this, is the only place a returning athlete's stored language is applied.
 */
export function localeAfterSignIn(
  stored: string | null | undefined,
  current: string,
  locales: readonly string[],
): string {
  return stored && locales.includes(stored) ? stored : current;
}
