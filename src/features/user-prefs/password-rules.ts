/**
 * What makes a password acceptable here (Mads, 2026-09-23), following NIST
 * SP 800-63B rather than the older habit of demanding a capital, a digit and a
 * symbol. That habit is why so many passwords are `Password1!`: it narrows the
 * search space an attacker has to cover while making the password harder for a
 * person to remember. Length does the work instead.
 *
 * So: a floor of 12 characters, a ceiling high enough for a passphrase or a
 * password manager's output, no composition rules at all, and two refusals that
 * catch what actually gets guessed — the handful of passwords everyone tries
 * first, and anything built from the account's own name or email.
 *
 * Pure, and shared: the change-password form checks it before sending, and the
 * refusal it returns names which rule and by how much, so the form can say
 * "12 characters, you have 9" instead of "invalid password".
 */

/** better-auth's own floor is 8; a tester's password should survive guessing. */
export const PASSWORD_MIN = 12;

/** High enough that a passphrase or a generated password is never truncated. */
export const PASSWORD_MAX = 128;

/** A name fragment shorter than this forbids too much to be a useful rule. */
const MEANINGFUL_FRAGMENT = 3;

/**
 * The passwords tried first in every credential-stuffing run, in the only
 * forms long enough to pass the length rule. A full breach corpus belongs
 * behind an API; this is the short list that costs nothing to check.
 */
export const COMMON_PASSWORDS: readonly string[] = [
  'password1234',
  'password123!',
  'passwordpassword',
  'qwertyuiop12',
  'qwertyuiopasdf',
  '123456789012',
  '1234567890ab',
  'iloveyou1234',
  'letmein12345',
  'welcome12345',
  'admin1234567',
  'football1234',
  'monkey123456',
  'dragon123456',
  'sunshine1234',
  'princess1234',
  'trustno12345',
  'baseball1234',
  'superman1234',
  'starwars1234',
];

const COMMON = new Set(COMMON_PASSWORDS.map((p) => p.toLowerCase()));

export type PasswordRefusal =
  | { problem: 'tooShort'; min: number; actual: number }
  | { problem: 'tooLong'; max: number }
  | { problem: 'common' }
  | { problem: 'personal' };

export interface PasswordCandidate {
  password: string;
  email: string;
  name?: string;
}

/** Letters and digits only — the form that sees through sprinkled punctuation. */
function onlyAlphanumeric(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The fragments an attacker already knows — the email, its local part, each
 * name word — reduced to letters and digits, which is the form they are
 * compared in. Reducing here rather than at the comparison is what lets the
 * length rule count the characters that will actually be matched: `J.R.` is
 * four characters but two letters, and two letters forbid far too much.
 */
function knownFragments({ email, name }: PasswordCandidate): string[] {
  // Stryker disable next-line StringLiteral — `split` always yields at least one element; the fallback is here because `noUncheckedIndexedAccess` cannot know that, and no input reaches it.
  const local = email.split('@')[0] ?? '';
  // Stryker disable next-line Regex — the `+` only collapses runs of separators, and a run leaves empty strings the length filter drops anyway; with or without it the fragments are the same.
  return [email, local, ...local.split(/[._-]+/), ...(name ?? '').split(/\s+/)]
    .map(onlyAlphanumeric)
    .filter((f) => f.length >= MEANINGFUL_FRAGMENT);
}

/** `null` when the password is acceptable, otherwise which rule refused it. */
export function checkPassword(candidate: PasswordCandidate): PasswordRefusal | null {
  const { password } = candidate;
  // Length first: a short common password should be told it is short, which is
  // the part the person can act on.
  if (password.length < PASSWORD_MIN) {
    return { problem: 'tooShort', min: PASSWORD_MIN, actual: password.length };
  }
  if (password.length > PASSWORD_MAX) return { problem: 'tooLong', max: PASSWORD_MAX };

  if (COMMON.has(password.toLowerCase())) return { problem: 'common' };
  // Both sides reduced the same way, so spaces and punctuation cannot hide a
  // name: "Sarah Berg Rules!" and "b.e.r.g." each become the letters the
  // fragment is looked for in.
  const alphanumeric = onlyAlphanumeric(password);
  if (knownFragments(candidate).some((f) => alphanumeric.includes(f))) {
    return { problem: 'personal' };
  }
  return null;
}
