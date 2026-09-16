import type { Citation } from '@/lib/citation';
import { DirectIdentifierError } from '@/lib/identifiers';
import type { Embedder } from '@/features/knowledge-oracle/embedder';
import {
  LOOKUP_TOOL,
  NO_PASSAGES_RESULT,
  parseLookupInput,
  renderPassages,
  sourceMentions,
} from '@/features/knowledge-oracle/lookup-tool';
import {
  retrievePassages,
  type KnowledgeSearch,
  type RetrievalResult,
} from '@/features/knowledge-oracle/retrieval';
import { openAiEmbedder, refusingEmbedder } from '@/features/knowledge-oracle/embedder';
import { knowledgeSearch } from '@/features/knowledge-oracle/knowledge-repository';
import { recordLookupPerformed } from '@/features/knowledge-oracle/lookup-repository';
import { logCoachDrift, logLookupFailure, type ModelSurface } from '@/lib/coach-log';
import { citationsFrom } from './citations';
import type { CoachTool, CoachToolCall } from './coach-client';

/**
 * A turn's grounding: the lookup tool, what happens when the Coach calls it, and
 * the citations that came back (`knowledge-oracle/05`).
 *
 * **One per turn**, created in the surface's `prepare` and discarded with it.
 * That is where F9 — the retrieval cost per conversation — is decided, and the
 * number is this: **at most one embedding and one vector query per turn in
 * which the Coach called the tool; zero on every other turn; nothing per
 * conversation; the system prompt is rendered per turn as before and not
 * cached.** Mads chose this over a per-conversation lookup and over caching the
 * rendered prompt (2026-09-11), on the recommendation that a prompt carrying
 * `TODAY` and the week's sessions is not static across one conversation.
 *
 * The passages ride along as the tool result — inside the turn — so the system
 * prompt stays a pure function of the athlete's state, as it was.
 */
export interface Grounding {
  tool: CoachTool;
  /** The tool result for one call: the passages, or the no-grounding sentence. */
  resolve(call: CoachToolCall): Promise<string>;
  /** Exactly what retrieval supplied, unchanged — or none. */
  citations(): Citation[];
}

/** What is recorded about a lookup: counts, never the question. */
export interface LookupRecord {
  /** Length of the question — the only thing kept about it. */
  questionLength: number;
  passages: number;
  citations: number;
}

export interface GroundingDeps {
  embedder: Embedder;
  search: KnowledgeSearch;
  /** Training Phase, as the horizon derives it; folds into the query. */
  phase?: string | null;
  experienceLevel?: string | null;
  /**
   * Where a lookup is written down so it can be counted later (option a,
   * 2026-09-11). A failing record never fails the lookup — evidence is not
   * worth an unanswered athlete. Required: a grounding nobody can count is a
   * grounding Mads cannot see.
   */
  record: (record: LookupRecord) => Promise<void>;
  /**
   * Where a lookup that could not run is written down — the embedder or the
   * database failing, not an empty corpus. Optional because the pure tests
   * have nowhere to send it; production wires the coach log. Never throws
   * into the turn: the athlete gets the unavailable sentence either way.
   */
  failed?: (error: unknown) => void;
}

export const LOOKUP_UNAVAILABLE =
  'Lookup unavailable. Answer without grounding and say that you have none.';

/**
 * What a second lookup in the same turn reads. F9 says *at most one* embedding
 * and one search per turn, and the adapter resolves tool calls concurrently —
 * so the limit has to live here, where the count is kept, or a model that
 * emits two calls would spend twice and the stored citations would cover only
 * whichever finished last (CodeRabbit, PR #67).
 */
export const LOOKUP_LIMIT_REACHED =
  'Lookup already performed this turn. Answer from the passages you were given.';

export function createGrounding(deps: GroundingDeps): Grounding {
  let latest: RetrievalResult | null = null;
  // Set synchronously, before the first await, so two concurrent calls cannot
  // both pass the check. A malformed call does not spend the turn's lookup.
  let spent = false;

  return {
    tool: LOOKUP_TOOL,

    async resolve(call) {
      const question = parseLookupInput(call.input);
      if (question === null) return NO_PASSAGES_RESULT;
      if (spent) return LOOKUP_LIMIT_REACHED;
      spent = true;

      let result: RetrievalResult;
      try {
        result = await retrievePassages({
          embedder: deps.embedder,
          search: deps.search,
          query: {
            question,
            phase: deps.phase ?? undefined,
            experienceLevel: deps.experienceLevel ?? undefined,
          },
        });
      } catch (error) {
        // An identifier in the question is the athlete's mistake, not an outage:
        // answer without grounding rather than refusing the turn, and do not
        // log it as a failure — it is a refusal, and a correct one. Anything
        // else — the embedder, the database — is an outage the athlete never
        // sees (they get the same sentence), so it is reported here, where the
        // surface and athlete are known, rather than thrown to an adapter that
        // catches silently. Without this line a retrieval outage was
        // indistinguishable from a turn with no lookup (CodeRabbit, PR #67).
        if (!(error instanceof DirectIdentifierError)) deps.failed?.(error);
        return LOOKUP_UNAVAILABLE;
      }

      latest = result;
      await recordQuietly(deps.record, {
        questionLength: question.length,
        passages: result.passages.length,
        citations: result.citations.length,
      });
      return renderPassages(result);
    },

    citations() {
      return citationsFrom(latest);
    },
  };
}

async function recordQuietly(
  record: GroundingDeps['record'],
  entry: LookupRecord,
): Promise<void> {
  try {
    await record(entry);
  } catch {
    // Deliberately swallowed: see `GroundingDeps.record`.
  }
}

/**
 * The grounding a real turn gets: OpenAI to embed the question, the corpus in
 * Neon to search, and the `events` log to count the lookup in.
 *
 * With no `OPENAI_API_KEY` the embedder refuses at call time and the adapter
 * renders the unavailable sentence — the athlete gets an ungrounded answer that
 * says so, never no answer. `refusingEmbedder` rather than letting
 * `openAiEmbedder` fail on its own so the reason in the log is one line, not a
 * provider stack.
 */
export function productionGrounding(facts: {
  athleteId: string;
  surface: ModelSurface;
  conversationId: string | null;
  phase?: string | null;
  experienceLevel?: string | null;
}): Grounding {
  return createGrounding({
    embedder: process.env.OPENAI_API_KEY
      ? openAiEmbedder()
      : refusingEmbedder('OPENAI_API_KEY is not set — retrieval cannot embed the question'),
    search: knowledgeSearch(),
    phase: facts.phase,
    experienceLevel: facts.experienceLevel,
    record: (entry) =>
      recordLookupPerformed(facts.athleteId, {
        surface: facts.surface,
        conversationId: facts.conversationId,
        ...entry,
      }),
    failed: (error) =>
      logLookupFailure({
        surface: facts.surface,
        athleteId: facts.athleteId,
        conversationId: facts.conversationId,
        error,
      }),
  });
}

/**
 * The silence check (`knowledge-oracle/05`, decision 3): a reply that names a
 * source in its own words is logged, by pattern name, and stored untouched.
 * Called by every surface that stores a Coach reply, after the model answers.
 */
export function noteSourceMentions(
  surface: ModelSurface,
  athleteId: string,
  conversationId: string | null,
  reply: string,
): void {
  const patterns = sourceMentions(reply);
  if (patterns.length === 0) return;
  logCoachDrift({ surface, athleteId, conversationId, patterns });
}
