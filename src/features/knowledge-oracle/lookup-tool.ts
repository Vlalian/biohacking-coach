import type { CoachTool } from '@/features/coach/coach-client';
import type { RetrievalResult } from './retrieval';

/**
 * The tool the Coach calls when it wants grounding (`knowledge-oracle/05`).
 *
 * Retrieval is for claims, not chatter, and the decision of *when* a message
 * carries a training-science claim is the Coach's own (Mads, 2026-09-11) — made
 * by calling this tool, or not. So the description is the gate: it has to say
 * when to look and, in the same breath, when not to, or the model looks things
 * up on "felt great". Every call is visible as a tool use, so the rate at which
 * it reaches for this is inspectable after the fact (`grounding.ts`).
 *
 * Pure, and imports only the *type* of a tool from the adapter — the adapter is
 * `server-only`, and this file has to stay importable from a plain test.
 */
export const LOOKUP_TOOL_NAME = 'look_up_training_science';

export const LOOKUP_TOOL: CoachTool = {
  name: LOOKUP_TOOL_NAME,
  description:
    'Look up the training-science evidence behind a claim BEFORE you state it as fact — ' +
    'why an easy day is easy, how much intensity a week should carry, what the research ' +
    'says about tapering, fuelling, sleep or recovery. Answer from the passages returned. ' +
    'Do NOT call this for how the athlete feels, for logistics or scheduling, for ' +
    'acknowledgements, or for anything that is not a training-science claim.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['question'],
    properties: {
      question: {
        type: 'string',
        description: 'The training-science question, in plain words, without any personal details.',
      },
    },
  },
};

/** The question the Coach asked, or null when the input is not one. */
export function parseLookupInput(input: unknown): string | null {
  // Optional chaining does the type guarding: null, undefined and primitives
  // all yield `undefined` here, and only a string survives the next line.
  const question = (input as { question?: unknown } | null | undefined)?.question;
  if (typeof question !== 'string') return null;
  const trimmed = question.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * What the Coach reads when the corpus had nothing. **Declared Uncertainty**
 * already exists in the domain language for this — the Coach naming when it
 * cannot make a confident call — and an ungrounded claim is a case of it.
 */
export const NO_PASSAGES_RESULT =
  'No passages found. Tell the athlete you do not have grounding for this claim, and do not state it as fact.';

/**
 * The retrieved passages as the Coach reads them: numbered in rank order, each
 * with its source. Deliberately nothing about *how* to cite — the app renders the
 * reference list itself from what retrieval supplied, and the reply must stay
 * silent about sources (Mads, 2026-09-11; the 2026-08-18 decision that the model
 * never writes a citation).
 */
export function renderPassages(result: RetrievalResult): string {
  if (result.passages.length === 0) return NO_PASSAGES_RESULT;
  const byId = new Map(result.citations.map((c) => [c.sourceId, c]));
  return result.passages
    .map((p, i) => {
      const source = byId.get(p.sourceId);
      const label = source ? `${source.authors} (${source.year})` : 'Unknown source';
      return `[${i + 1}] ${label} — ${p.text}`;
    })
    .join('\n');
}

/**
 * The patterns the grounding instruction forbids in a reply, in a stable order.
 *
 * A **check that logs, never a rewrite**: the reply is stored as the model wrote
 * it. Rewriting model prose is what the 2026-08-18 decision refused, and this
 * exists so Mads can see whether the instruction is holding without reading
 * transcripts. "Source" used plainly — "a good source of carbs" — does not match.
 */
const SOURCE_MENTION_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'bracket-marker', pattern: /\[\d+\]/ },
  { name: 'source-parenthetical', pattern: /\(\s*source\s*:/i },
  { name: 'according-to-study', pattern: /according to (the|a|this) (study|paper|research|literature)/i },
  { name: 'as-cited', pattern: /\bas cited\b/i },
];

export function sourceMentions(text: string): string[] {
  return SOURCE_MENTION_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.name);
}
