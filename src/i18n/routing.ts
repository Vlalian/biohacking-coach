import { defineRouting } from 'next-intl/routing';

// Danish athletes are the primary market, but a visitor who has not onboarded
// yet has no stated preference — English is the neutral starting point, and
// MCQ onboarding sets the real preference from there.
export const routing = defineRouting({
  locales: ['en', 'da'],
  defaultLocale: 'en',
});

export type Locale = (typeof routing.locales)[number];
