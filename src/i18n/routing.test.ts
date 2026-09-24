import { describe, expect, it } from 'vitest';
import { routing } from './routing';

describe('routing', () => {
  it('never guesses a language from the browser: detection is off, English is the start', () => {
    // showable-version/34, Mads's ruling: nothing before onboarding's language
    // step guesses. With detection on, next-intl reads Accept-Language and the
    // cookie and sent a Danish browser to /da/sign-in.
    expect(routing.localeDetection).toBe(false);
    expect(routing.defaultLocale).toBe('en');
  });
});
