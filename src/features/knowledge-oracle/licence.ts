/**
 * The admission rule, as code.
 *
 * `corpus.md` (issue 01) set it stricter than "open access": **CC0 and CC BY
 * only**. The reasoning is about this system specifically, and it is repeated
 * here because a rule enforced in code and argued in a gitignored document is
 * one edit away from disagreeing with itself:
 *
 * - **NonCommercial** is out because this product will charge athletes.
 * - **NoDerivatives** is out because chunking and embedding transform the text,
 *   and "is a RAG answer a derivative?" is not a question a corpus should hold
 *   an arguable position on.
 * - **ShareAlike** is out pending a deliberate decision about the Coach's own
 *   output.
 *
 * Pure: a string in, a verdict out. No network, no database, no filesystem.
 */

/**
 * A licence string admitted by the rule above, with the version optional.
 *
 * Anchored at both ends: an unanchored branch is how a whitelist quietly
 * becomes a prefix match, which is the one failure direction it exists to
 * prevent. `"CC0 except figures"` was admitted that way.
 *
 * **The versions are enumerated, not matched as a number.** Creative Commons
 * published CC BY at 1.0, 2.0, 2.5, 3.0 and 4.0, and CC0 only at 1.0; there is
 * no other. `\d+(\.\d+)?` reads as a tighter rule than "any version" and is not
 * one — it admitted `CC0 2.0` and `CC BY 99.0`, neither of which exists, which
 * is precisely the "a licence invented next year" case the whitelist is here to
 * reject. A version CC publishes after this is written *should* fail here: the
 * right response to a new licence is a person reading it, not a regex that
 * already said yes.
 */
const ADMISSIBLE = /^cc(?:0(?:\s+1\.0)?|\s+by(?:\s+(?:1\.0|2\.0|2\.5|3\.0|4\.0))?)$/;

/**
 * Is this licence one the corpus may ingest?
 *
 * Deliberately a whitelist, not a blacklist. A blacklist that misses a clause
 * admits the source; a whitelist that misses a clause rejects it. Only one of
 * those two failure directions costs a licence conversation, so the unknown
 * string — `""`, `"all rights reserved"`, a licence invented next year — is
 * rejected by construction rather than by enumeration.
 *
 * Row 8 of the register is why the version is optional: Frontiers states
 * "CC BY" with no version on either the article page or the journal policy, and
 * unversioned CC BY is still commercial-use-allowed. The register refuses to
 * claim "4.0" for it, so this function must accept what the register can honestly
 * record.
 */
export function isAdmissible(licence: string): boolean {
  return ADMISSIBLE.test(licence.trim().toLowerCase());
}
