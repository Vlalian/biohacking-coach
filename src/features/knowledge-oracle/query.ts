import { assertNoDirectIdentifier } from '@/lib/identifiers';

/**
 * The pseudonymous query the Knowledge Oracle embeds.
 *
 * `CONTEXT.md` is explicit that the Knowledge Oracle "receives only anonymised
 * queries", and GDPR decision 1 says no direct identifier reaches any LLM —
 * embedding endpoints included, since an embedding call is a request to a vendor
 * like any other.
 *
 * **The guarantee is the shape of this type, not the assertion below.** There is
 * no `name`, `email`, `dateOfBirth` or `location` field here, so a caller
 * assembling a query from an athlete's training record has nothing identifying
 * to interpolate — the same structural separation ADR 0006 gives the rest of the
 * system, applied here. That is what actually keeps the promise.
 *
 * The assertion is the second layer, and it is narrower than it looks: it
 * recognises *shapes* — email and phone — and cannot recognise a name or a place
 * name in prose. It exists for `question`, which is athlete free text and can
 * contain anything. Do not describe it as proving the query is anonymous; it
 * catches the detectable accidents and fails closed on those.
 */
export interface OracleQuery {
  /** What the athlete (or a prompt builder acting for them) wants to know. */
  question: string;
}

/**
 * Renders an {@link OracleQuery} into the text that gets embedded: the
 * question, whitespace-normalised, and nothing else.
 *
 * **Why nothing else (2026-09-17).** Until the first SAFE-3 runs this prefixed
 * the athlete's Training Phase and experience level as prose, on the theory
 * that a taper question from a peaking athlete should pull taper passages.
 * Measured against the corpus, the prefix made *every* question read as
 * triathlon-training prose: 20 of 20 outside questions cleared the 0.43 floor
 * (13 of 20 bare), carbon-plated shoes scored 0.43 against an injury paper,
 * and the floor filtered nothing — so an athlete asking about swim technique
 * got "no grounding for this" above a reference list. Phase and experience
 * still reach the Coach, through the system prompt, where a wrong value reads
 * as a wrong sentence instead of a vector aimed at the wrong passages. If
 * phase-aware retrieval is wanted later, it belongs in a reranker over the
 * candidates (post-testing §14), not in the query.
 */
export function buildOracleQuery(input: OracleQuery): string {
  assertNoDirectIdentifier(input);
  return input.question.replace(/\s+/g, ' ').trim();
}
