import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

/**
 * The zone every `format.dateTime` runs in, on the server and in the browser.
 *
 * Pinned for the test round (`showable-version/25`, Mads, 2026-09-17): every
 * tester is in Denmark, the profile has no timezone field, and Vercel's
 * server is UTC — without a pin, a local-midnight `Date` formatted through
 * next-intl read one day early on every deployment. Post-test follow-up: a
 * per-athlete timezone on the profile replaces this constant.
 */
export const APP_TIME_ZONE = 'Europe/Copenhagen';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    timeZone: APP_TIME_ZONE,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
