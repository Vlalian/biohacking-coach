import type { Citation } from '@/lib/citation';
import type { RetrievalResult } from '@/features/knowledge-oracle/retrieval';

/**
 * The citation channel: how the sources behind a Coach answer reach the athlete.
 *
 * SAFE-3 asks that training-science claims are grounded **with citations**, and a
 * citation that exists only inside the prompt is not one the athlete can see. The
 * path from adapter to service to persistence to UI carried text only; this
 * module is the seam that lets a source survive it.
 *
 * **The model never writes a citation.** Mads decided the presentation twice on
 * 2026-08-18 and the second decision is the one built: a plain reference list, as
 * in a paper, rather than an underlined span inside the reply. That is the
 * structurally safer option and not merely the cheaper one. An underlined span is
 * a claim about a range of characters in text the model generated, so the model
 * has to mark them — and a model that writes its own citations can write one for
 * a claim it invented. A fabricated citation is worse than none, because the
 * underline is itself a trust signal. The reference list has no such failure
 * mode: the app already knows which passages retrieval supplied and renders that
 * list itself, so the model's cooperation is never required and its honesty never
 * relied upon.
 *
 * The cost is precision. This says "these sources were in front of me", not "this
 * sentence came from source 3" — which is why the heading is *"What I drew on"*
 * and not *"Sources"*. Overstating the evidence defeats SAFE-3 more quietly than
 * no citation would.
 */

/**
 * The references behind a reply — exactly what retrieval supplied, or none.
 *
 * **The reply is deliberately not a parameter.** The anti-fabrication guarantee
 * is that no reference can originate in the model's text, and the strongest way
 * to state that is a function which cannot see the text at all. A signature that
 * took the reply and promised not to read it would be a comment; this is a type.
 *
 * The list is passed through **unchanged**. `retrieval.ts` already deduplicated
 * it by source, ordered it by rank and capped it at `MAX_CITATIONS`, and it caps
 * by *source* so that every passage shown is accounted for by a citation that is
 * actually displayed. Re-deduplicating or re-capping here is how that cap ends up
 * applied to the wrong thing.
 */
export function citationsFrom(retrieval: RetrievalResult | null): Citation[] {
  return retrieval?.citations ?? [];
}
