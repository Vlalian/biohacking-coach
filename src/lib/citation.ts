/**
 * One source the Coach drew on.
 *
 * **The app builds this, never the model.** That is the whole decision recorded
 * in code-health/06: an inline underlined span would be a claim about a range of
 * characters in text the model generated, which only the model can mark — and a
 * model that writes its own citations can write one for a claim it invented. A
 * fabricated citation is worse than none, because the citation is itself a trust
 * signal. Here the app already knows which passages retrieval supplied and
 * renders that list itself, so a citation cannot be fabricated: the model is not
 * the one producing it.
 *
 * The cost is precision. This says "these sources were in front of me", not
 * "this sentence came from source 3" — so whatever renders it must not be
 * labelled in a way that implies claim-level attribution. "What I drew on" is
 * honest; "Sources" overstates it.
 *
 * `ordinals` is carried because `knowledge_chunks.ordinal` exists precisely to
 * keep a chunk resolvable to its place in the article. Nothing reads it yet; it
 * is what an inline-anchoring upgrade would need, and it costs one column.
 *
 * **It lives in `lib/` rather than in the Knowledge Oracle that produces it, and
 * that is the point of the module** — the same reason and the same shape as
 * {@link conversation-kinds}. Four consumers need this type: the Oracle builds
 * it, the Coach carries it, `db/schema.ts` types the column that stores it, and
 * the UI renders it. Defined in the Oracle, the database layer had to import
 * from a feature, which points the dependency arrow away from the core against
 * AGENTS.md's "dependencies flow one way, toward the core". Type-only, so
 * nothing shipped that should not have — but the import was the arrow, and a
 * shared shape belongs where every side may reach it. Moved 2026-09-08 on Mads's
 * call, in the review of `2409af9`.
 */
export interface Citation {
  sourceId: string;
  slug: string;
  title: string;
  authors: string;
  year: number;
  /** Where to send the reader, or null when the source has no stable link. */
  url: string | null;
  licence: string;
  licenceUrl: string;
  /** Ready to display beside the passage — CC BY requires it. */
  attribution: string;
  /** Which chunks of this source were retrieved, ascending. */
  ordinals: number[];
}
