import { describe, it, expect } from 'vitest';
import { PREFERRED_NAME_MAX, matchesAccountName, parsePreferredName } from './preferred-name';

/**
 * The Preferred Name is the one value that reaches a prompt *by the athlete's
 * choice* (`preferred-name/02`). Two rules are pure enough to test here: what
 * the write boundary accepts, and when the screen warns that the typed value is
 * the athlete's real name.
 */

describe('parsePreferredName — the write boundary', () => {
  it('accepts a plain name, trimmed and with inner whitespace collapsed', () => {
    expect(parsePreferredName('  Mads  ')).toEqual({ ok: true, name: 'Mads' });
    expect(parsePreferredName('The   Captain')).toEqual({ ok: true, name: 'The Captain' });
  });

  it('reads nothing at all as "no name" — leaving the field blank is an answer', () => {
    expect(parsePreferredName(undefined)).toEqual({ ok: true, name: null });
    expect(parsePreferredName('')).toEqual({ ok: true, name: null });
    expect(parsePreferredName('   ')).toEqual({ ok: true, name: null });
  });

  it('refuses a non-string — a server action payload is untrusted', () => {
    expect(parsePreferredName(42)).toEqual({ ok: false });
    expect(parsePreferredName(null)).toEqual({ ok: false });
    expect(parsePreferredName({ name: 'Mads' })).toEqual({ ok: false });
  });

  it('caps the length, measured after trimming', () => {
    const atCap = 'a'.repeat(PREFERRED_NAME_MAX);
    expect(parsePreferredName(`  ${atCap}  `)).toEqual({ ok: true, name: atCap });
    expect(parsePreferredName('a'.repeat(PREFERRED_NAME_MAX + 1))).toEqual({ ok: false });
  });

  it('refuses an email- or phone-shaped value: the prompt exempts this field from the identifier assertion, so the check lives here', () => {
    expect(parsePreferredName('mads@example.com')).toEqual({ ok: false });
    expect(parsePreferredName('+45 12 34 56 78')).toEqual({ ok: false });
  });
});

describe('matchesAccountName — the real-name warning', () => {
  it('matches any whitespace-separated token of the account name, case-insensitively', () => {
    expect(matchesAccountName('mads', 'Mads Kilstrup')).toBe(true);
    expect(matchesAccountName('KILSTRUP', 'Mads Kilstrup')).toBe(true);
  });

  it('matches when any token of the typed name is a token of the account name', () => {
    expect(matchesAccountName('Mads K', 'Mads Kilstrup')).toBe(true);
    expect(matchesAccountName('Mads Kilstrup', 'Mads Kilstrup')).toBe(true);
  });

  it('does not match a nickname, a prefix, or a name inside another word', () => {
    expect(matchesAccountName('Madsen', 'Mads Kilstrup')).toBe(false);
    expect(matchesAccountName('Ma', 'Mads Kilstrup')).toBe(false);
    expect(matchesAccountName('Captain', 'Mads Kilstrup')).toBe(false);
  });

  it('never matches an empty value, whatever the account name — including an empty one', () => {
    expect(matchesAccountName('', 'Mads Kilstrup')).toBe(false);
    expect(matchesAccountName('   ', 'Mads Kilstrup')).toBe(false);
    expect(matchesAccountName('Mads', '')).toBe(false);
    expect(matchesAccountName('', '')).toBe(false);
    expect(matchesAccountName('  ', '  ')).toBe(false);
  });

  it('tokenises on any run of whitespace, not on characters', () => {
    expect(matchesAccountName('kilstrup', 'Mads 	  Kilstrup')).toBe(true);
    // Every letter of "Ma" is in "Mads", and it still is not a token of it.
    expect(matchesAccountName('a', 'Mads Kilstrup')).toBe(false);
  });
});
