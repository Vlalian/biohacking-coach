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
 * A phone-shaped run: `+` followed by 8–15 digits, or a bare contiguous run of
 * 8–15 digits. Deliberately tight so ordinary training prose survives it — an
 * ISO date (`2026-08-18`), a duration (`90 min`), a pulse (`55bpm`) and an
 * interval set (`4x800m`) all have digit runs far shorter than eight.
 */
const PHONE_SHAPED = /\+\d[\d\s-]{6,16}\d|\b\d{8,15}\b/;

const SHAPED_IDENTIFIERS: ReadonlyArray<{ kind: string; pattern: RegExp }> = [
  { kind: 'email', pattern: EMAIL_SHAPED },
  { kind: 'phone', pattern: PHONE_SHAPED },
];

/** The kind of identifier this string looks like, or null if none. */
export function shapedIdentifierIn(value: string): string | null {
  return SHAPED_IDENTIFIERS.find(({ pattern }) => pattern.test(value))?.kind ?? null;
}

/**
 * The non-throwing form, for a validator that wants to refuse an input as data
 * rather than fail the request. Null and non-strings are free of identifiers by
 * definition — there is nothing to match.
 */
export function isFreeOfShapedIdentifiers(value: string | null | undefined): boolean {
  return typeof value !== 'string' || shapedIdentifierIn(value) === null;
}
