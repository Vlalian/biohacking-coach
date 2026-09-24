import { defineRouting } from 'next-intl/routing';

// Danish athletes are the primary market, but a visitor who has not onboarded
// yet has no stated preference — English is the neutral starting point, and
// MCQ onboarding sets the real preference from there. Detection is off so the
// browser's Accept-Language and the NEXT_LOCALE cookie are never read for the
// start page (showable-version/34): the cookie is still written on every
// locale switch, and a returning athlete's stored language is applied in the
// sign-in form's success path, not guessed here.
export const routing = defineRouting({
  locales: ['en', 'da'],
  defaultLocale: 'en',
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
