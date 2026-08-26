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
 * Anchored at both ends, and one alternation rather than two: an unanchored
 * branch is how a whitelist quietly becomes a prefix match, which is the one
 * failure direction the whitelist exists to prevent. `CC0` and `CC BY` differ
 * only in how the bare grant is spelled, so they share the optional-version
 * tail rather than each carrying — and each having to anchor — its own.
 */
const ADMISSIBLE = /^cc(?:0|\s+by)(?:\s+\d+(?:\.\d+)?)?$/;

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
