/**
 * Shape-detectable direct identifiers — the one definition, shared.
 *
 * Lives in `lib/` rather than inside a feature because two features need the
 * same answer: the Coach's prompt builders assert on it before anything reaches
 * the Anthropic API, and Equipment refuses it at the write boundary so a value
 * that would later throw is never stored. A second copy of these patterns is
 * exactly the drift that makes a privacy control untrustworthy.
 *
 * **What this can and cannot do.** AGENTS.md names four identifiers — name,
 * email, DOB, location — and only some have a shape a pattern can recognise.
 * Email and phone do. A name and a place name in prose do not: "long ride with
 * Lars in Odense" is indistinguishable from ordinary training text, and a
 * pattern that tried would either miss real names or eat legitimate content.
 *
 * So this is the *second* layer, and the smaller one. The first is structural:
 * identity is separated from training data by opaque athlete id (ADR 0006), so
 * a prompt assembled from an athlete's training record has no name to
 * interpolate. Athlete free text reaching the model is covered by the consent
 * disclosure (CONTEXT.md, Privacy Proxy), not by a filter. Do not describe this
 * module as guaranteeing that no identifier reaches a prompt — it catches the
 * detectable ones and fails closed on those.
 */

/** Anything shaped like `local@domain` — the cheapest tell of a leaked email. */
const EMAIL_SHAPED = /[^\s@]+@[^\s@]+/;

/**
 * A phone-shaped run: `+` followed by 8–15 digits, optionally spaced or hyphen
 * separated, or a bare contiguous run of 8–15 digits. Deliberately tight so
 * ordinary training prose survives it — an ISO date (`2026-08-18`), a duration
 * (`90 min`), a pulse (`55bpm`) and an interval set (`4x800m`) all have digit
 * runs far shorter than eight.
 *
 * The `+` branch counts *digits*, not characters. It used to read
 * `\+\d[\d\s-]{6,16}\d`, which let the separator class fill the quota: 18
 * digits passed a rule documented — right here — as 8–15, and E.164 has no
 * numbers that long. Over-matching fails closed, so it never leaked anything;
 * it refused Oracle input carrying a long numeric identifier and told the
 * athlete their content looked like contact details.
 *
 * The trailing `(?![\d\s-]*\d)` is what makes the ceiling bind. Without it the
 * pattern simply matched the first fifteen digits of a longer run and called
 * that a phone number — the bare branch is protected by its closing `\b`, and
 * the `+` branch had no equivalent.
 */
const PHONE_SHAPED = /\+\d(?:[\s-]?\d){7,14}(?![\d\s-]*\d)|\b\d{8,15}\b/;

const SHAPED_IDENTIFIERS: ReadonlyArray<{ kind: string; pattern: RegExp }> = [
  { kind: 'email', pattern: EMAIL_SHAPED },
  { kind: 'phone', pattern: PHONE_SHAPED },
];

/**
 * Thrown when app data carrying a shaped identifier reaches a prompt builder.
 *
 * A named type rather than a bare Error so a caller can tell this apart from an
 * upstream failure. The difference matters to the athlete: a Coach that could
 * not be reached deserves "try again", while content that will be refused
 * identically every time does not.
 */
export class DirectIdentifierError extends Error {
  constructor(readonly kind: string) {
    super(
      `Prompt input carries a ${kind}-shaped value — no direct identifier may ` +
        'reach a prompt (GDPR decision 1).',
    );
    this.name = 'DirectIdentifierError';
  }
}

/** The kind of identifier this string looks like, or null if none. */
export function shapedIdentifierIn(value: string): string | null {
  return SHAPED_IDENTIFIERS.find(({ pattern }) => pattern.test(value))?.kind ?? null;
}

/**
 * The non-throwing form, for a validator that wants to refuse an input as data
 * rather than fail the request. Null and non-strings are free of identifiers by
 * definition — there is nothing to match.
 *
 * `unknown` because its caller is a write boundary taking client-supplied data,
 * and the `typeof` check is load-bearing rather than defensive typing:
 * {@link shapedIdentifierIn} runs `RegExp.test`, which stringifies whatever it
 * is handed, so an array holding one phone-shaped string would otherwise be
 * reported as *carrying* an identifier and refused — the opposite verdict from
 * the one this function gives every other non-string.
 */
export function isFreeOfShapedIdentifiers(value: unknown): boolean {
  return typeof value !== 'string' || shapedIdentifierIn(value) === null;
}

/** Why a Coach turn was refused, in the terms every caller reports upward. */
export type RefusalReason = 'unsafe-content' | 'coach-unavailable';

/**
 * Which refusal a thrown Coach call is.
 *
 * The split matters to the athlete, not just to the log: "the Coach could not be
 * reached" invites a retry, while content this module refused will be refused
 * identically every time. That is the difference between a retry button that can
 * work and one that cannot.
 *
 * Lives here, next to {@link DirectIdentifierError}, rather than in the Coach
 * adapter: the whole question is "is this that error?", which is this module's
 * concept, and nothing about it involves the Anthropic SDK. It is also why the
 * services can use it while still mocking the adapter wholesale in their tests.
 *
 * Written once because all three Coach services made this same call, and
 * `briefing-service` had already extracted it locally — three agreeing copies of
 * a rule is the moment to move it, before a fourth caller gets it subtly wrong.
 */
export function refusalReason(error: unknown): RefusalReason {
  return error instanceof DirectIdentifierError ? 'unsafe-content' : 'coach-unavailable';
}

/**
 * Walks every nested string leaf of an app-assembled prompt input looking for a
 * *shape-detectable* identifier, and throws if one is found (GDPR decision 1 /
 * ADR 0006).
 *
 * The same runtime guarantee `assertNoIdentity` makes for a check-in,
 * exposed for any prompt builder that assembles its own material from an
 * athlete's opaque record — the Coach Briefing (slice 13) is the second caller.
 * The walk is deep because an identifier realistically hides in a free-text leaf
 * (an onboarding answer, a session note), not the top-level scalars.
 *
 * **What this does and does not guarantee.** AGENTS.md names four identifiers —
 * name, email, DOB, location — and only some of those have a shape a regex can
 * recognise. So the control is in two layers, and this function is the second:
 *
 *  1. **Structural (primary).** Identity is separated from training data by
 *     opaque athlete id (ADR 0006): training tables carry no name, email, DOB or
 *     location column, so a prompt assembled from an athlete's training record
 *     has nothing to interpolate. `personaName` is refused outright by
 *     `assertNoIdentity`. This is what actually makes the promise true.
 *  2. **Shape guard (backstop, here).** Athlete *free text* — a session note, an
 *     onboarding answer — can say anything, and no pattern can recognise a name
 *     or a place name in prose. What it can catch is email and phone shapes, so
 *     it catches those and fails closed.
 *
 * A name typed into a session note is therefore *not* caught here, by design —
 * it is covered by the consent disclosure that says athlete free text reaches
 * the model (`CONTEXT.md`, Privacy Proxy). Do not describe this function as
 * asserting that no identifier of any kind can reach a prompt; it asserts the
 * detectable ones.
 */
export function assertNoDirectIdentifier(value: unknown): void {
  if (typeof value === 'string') {
    const kind = shapedIdentifierIn(value);
    if (kind) throw new DirectIdentifierError(kind);
    return;
  }
  // Everything that is not a string is walked by enumerating its values, and
  // `Object.values` is enough on its own to do it:
  //
  //   - an array enumerates to its elements, exactly as `forEach` would, so the
  //     separate `Array.isArray` branch this used to carry was dead weight;
  //   - a number, boolean or symbol enumerates to `[]`, so it walks nothing;
  //   - `null` and `undefined` throw, which is why the truthiness guard stays.
  //
  // Both branches were found by mutation testing, not by review: the array walk
  // and a `typeof value === 'object'` check could each be deleted with every test
  // still green. Removed rather than suppressed — an equivalent mutant is usually
  // telling you about the code, not about the test.
  if (value) {
    Object.values(value).forEach(assertNoDirectIdentifier);
  }
}
