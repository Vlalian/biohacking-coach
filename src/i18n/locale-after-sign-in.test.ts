import { describe, expect, it } from 'vitest';
import { localeAfterSignIn } from './locale-after-sign-in';

const LOCALES = ['en', 'da'] as const;

describe('localeAfterSignIn', () => {
  it.each([
    ['da', 'en', 'da'], // stored Danish wins over the English sign-in page
    ['en', 'da', 'en'],
    [null, 'da', 'da'], // nothing stored: stay where you are
    [undefined, 'en', 'en'],
    ['xx', 'en', 'en'], // an unknown stored value is ignored
    ['', 'da', 'da'],
  ])('stored %s on /%s → /%s', (stored, current, expected) => {
    expect(localeAfterSignIn(stored, current, LOCALES)).toBe(expected);
  });
});
