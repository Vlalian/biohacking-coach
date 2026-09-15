import { getDb } from '@/db';
import { events } from '@/db/schema';
import type { ModelSurface } from '@/lib/coach-log';

/**
 * A lookup, written down so it can be counted (`knowledge-oracle/05`, option a
 * — Mads, 2026-09-11).
 *
 * Two habits of the live model cannot be unit-tested: how often the Coach
 * reaches for the lookup tool, and whether it stays silent about sources. This
 * row is the evidence for the first. It goes on the append-only `events` log as
 * a `coach_ai` act — the first `coach_ai` event type, which slice 07 will need
 * anyway — and it carries **counts, never the question**: the question is the
 * athlete's free text and does not belong in a log row.
 *
 * "How often does it look?" and "did it look on a message with no science in
 * it?" are then one query per athlete over `events` where `type =
 * 'lookup_performed'`.
 *
 * Never narrated: `narration-repository.ts` reads `head_coach` actors and a
 * fixed type list, and this is neither.
 */
export const LOOKUP_PERFORMED_EVENT = 'lookup_performed';

export interface LookupPerformed {
  surface: ModelSurface;
  /** Null on a first Coach Chat message — the conversation is minted after the reply. */
  conversationId: string | null;
  questionLength: number;
  passages: number;
  citations: number;
}

export async function recordLookupPerformed(
  athleteId: string,
  lookup: LookupPerformed,
): Promise<void> {
  await getDb()
    .insert(events)
    .values({
      athleteId,
      actorType: 'coach_ai',
      type: LOOKUP_PERFORMED_EVENT,
      payload: lookup,
    });
}
