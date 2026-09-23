import { describe, it, expect } from 'vitest';
import { COMMON_PASSWORDS, PASSWORD_MAX, PASSWORD_MIN, checkPassword } from './password-rules';

/**
 * The rules Mads ruled on 2026-09-23, from NIST SP 800-63B: length is what
 * resists guessing, composition rules are what push people to `Password1!`.
 */
describe('checkPassword', () => {
  const account = { name: 'Sarah Berg', email: 'sarah.berg@example.dk' };

  it('accepts a long passphrase with no capitals, digits or symbols at all', () => {
    expect(checkPassword({ ...account, password: 'correct horse battery staple' })).toBeNull();
  });

  it('accepts anything from 12 characters to 128', () => {
    expect(checkPassword({ ...account, password: 'a'.repeat(PASSWORD_MIN) })).toBeNull();
    expect(checkPassword({ ...account, password: 'a'.repeat(PASSWORD_MAX) })).toBeNull();
  });

  it('refuses a short one, and says how short', () => {
    expect(checkPassword({ ...account, password: 'a'.repeat(PASSWORD_MIN - 1) })).toEqual({
      problem: 'tooShort',
      min: PASSWORD_MIN,
      actual: PASSWORD_MIN - 1,
    });
  });

  it('refuses one longer than the maximum rather than truncating it', () => {
    expect(checkPassword({ ...account, password: 'a'.repeat(PASSWORD_MAX + 1) })).toEqual({
      problem: 'tooLong',
      max: PASSWORD_MAX,
    });
  });

  it('has a list to check in the first place', () => {
    // Without this, every assertion that iterates the list passes on an empty one.
    expect(COMMON_PASSWORDS.length).toBeGreaterThan(15);
    expect(COMMON_PASSWORDS).toContain('password1234');
    expect(new Set(COMMON_PASSWORDS).size).toBe(COMMON_PASSWORDS.length);
  });

  it('refuses every password on the list, and the same ones shouted', () => {
    for (const common of COMMON_PASSWORDS) {
      expect(checkPassword({ ...account, password: common }), common).toEqual({ problem: 'common' });
      expect(checkPassword({ ...account, password: common.toUpperCase() }), common).toEqual({ problem: 'common' });
    }
    // Long enough to reach the rule, so a survivor here is the list, not the length.
    for (const common of COMMON_PASSWORDS) expect(common.length).toBeGreaterThanOrEqual(PASSWORD_MIN);
  });

  it('refuses one built from their own email or name, which an attacker knows', () => {
    expect(checkPassword({ ...account, password: 'sarah.berg-2026' })).toEqual({ problem: 'personal' });
    expect(checkPassword({ ...account, password: 'SarahBergRules!' })).toEqual({ problem: 'personal' });
    expect(checkPassword({ ...account, password: 'berg is my name' })).toEqual({ problem: 'personal' });
    // The whole address, and the part in front of the @ on its own.
    expect(checkPassword({ ...account, password: 'sarah.berg@example.dk!' })).toEqual({ problem: 'personal' });
  });

  it('splits an email local part on every separator it might use', () => {
    for (const email of ['anna_holm@x.dk', 'anna-holm@x.dk', 'anna.holm@x.dk']) {
      expect(checkPassword({ email, password: 'holmgang forever' }), email).toEqual({ problem: 'personal' });
    }
  });

  it('compares in one case, so an address typed in capitals is still their own', () => {
    expect(
      checkPassword({ email: 'Sarah.Berg@Example.dk', password: 'x sarah.berg@example.dk x' }),
    ).toEqual({ problem: 'personal' });
  });

  it('invents no fragments for an account with no name', () => {
    // An empty name must contribute nothing; a stray word here would forbid
    // every password containing it.
    expect(checkPassword({ email: 'x@y.dk', password: 'was here all along' })).toBeNull();
    expect(checkPassword({ name: '', email: 'x@y.dk', password: 'was here all along' })).toBeNull();
  });

  it('sees a fragment that only the email as typed contains', () => {
    // The whole address has an @ and a dot in it, so it is found in the raw
    // password rather than in the letters-and-digits form.
    expect(checkPassword({ email: 'anna@holm.dk', password: 'x anna@holm.dk x' })).toEqual({
      problem: 'personal',
    });
  });

  it('splits a name on whitespace, however much of it there is', () => {
    expect(checkPassword({ name: 'Anna   Vestergaard', email: 'x@y.dk', password: 'vestergaard1' })).toEqual({
      problem: 'personal',
    });
  });

  it('draws the line at three characters: a three-letter word counts, two do not', () => {
    expect(checkPassword({ name: 'Bo Ask', email: 'x@y.dk', password: 'ask me anything' })).toEqual({
      problem: 'personal',
    });
    expect(checkPassword({ name: 'Bo Ask', email: 'x@y.dk', password: 'bothersome trees' })).toBeNull();
  });

  it('sees through the punctuation someone sprinkles into their own name', () => {
    // Only the stripped form matches here: the raw password has separators
    // inside the name, so the two halves of the check each have work to do.
    expect(checkPassword({ name: 'Sarah Berg', email: 'sarah@x.dk', password: 'b.e.r.g. climbing' })).toEqual({
      problem: 'personal',
    });
    expect(checkPassword({ name: 'Sarah Berg', email: 'sarah@x.dk', password: 'climbing mountains' })).toBeNull();
  });

  it('ignores name fragments too short to mean anything', () => {
    // A two-letter name would forbid every password containing those letters.
    expect(checkPassword({ name: 'Jo Li', email: 'jo@x.dk', password: 'joinery collapses' })).toBeNull();
  });

  it('works for an account with no name set', () => {
    expect(checkPassword({ email: 'x@example.dk', password: 'a long enough one' })).toBeNull();
    expect(checkPassword({ email: 'x@example.dk', password: 'x@example.dk!!' })).toEqual({ problem: 'personal' });
  });

  it('checks length before anything else, so a short common one says the useful thing', () => {
    expect(checkPassword({ ...account, password: 'password' })).toMatchObject({ problem: 'tooShort' });
  });
});
