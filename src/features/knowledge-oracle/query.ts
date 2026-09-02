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
  /** Training Phase, in the Coach's own vocabulary — `base`, `build`, `peak`. */
  phase?: string;
  /** Experience level, as the Athlete Profile records it. */
  experienceLevel?: string;
}

/**
 * Renders an {@link OracleQuery} into the text that gets embedded.
 *
 * **Prose, not the `phase=build xp=veteran` tag syntax `stateBlock` uses for the
 * Coach prompt.** The two have opposite jobs: a prompt tells a model what is
 * true and terseness is a virtue, while this string is compared by cosine
 * distance against passages of published training science. Tag syntax appears
 * nowhere in a journal article, so it embeds as noise and pushes the vector away
 * from the very passages it is meant to find. The concepts are the same ones
 * `stateBlock` names; only the rendering differs, and it differs on purpose.
 *
 * Absent context is omitted rather than defaulted. `stateBlock` can afford
 * `xp=intermediate` as a fallback because a prompt with a wrong-but-plausible
 * value still reads sensibly; a query embedded with an invented experience level
 * is a vector aimed at the wrong place, and returns confidently wrong passages.
 */
export function buildOracleQuery(input: OracleQuery): string {
  assertNoDirectIdentifier(input);

  const context = [
    input.phase ? `Training phase: ${input.phase}.` : null,
    input.experienceLevel ? `Athlete experience level: ${input.experienceLevel}.` : null,
  ].filter((part): part is string => part !== null);

  return [...context, input.question].join(' ');
}
