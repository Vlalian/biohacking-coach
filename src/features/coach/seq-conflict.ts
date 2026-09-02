/**
 * The `(conversation_id, seq)` race, and the one way this codebase answers it.
 *
 * Every append to a conversation picks its `seq` by reading the current maximum
 * and adding one. That read-then-write is not atomic, so two writers to the
 * same conversation can pick the same number — the athlete sending a message at
 * the moment narration fires on app-open is the ordinary case, not a contrived
 * one.
 *
 * The `messages_conversation_seq_idx` unique index is what makes that a *failed
 * write* rather than a corrupted transcript. So the loser re-reads and retries,
 * and the bound matters: a persistent failure is a real error and must surface
 * rather than spin.
 *
 * Shared rather than duplicated (CodeRabbit, PR #39). `appendInOrder` had this
 * retry from the start; `claimAndNarrate` did not, and a second copy of a
 * concurrency rule is how the two drift apart.
 */

/** How many times a writer re-reads and retries before the error surfaces. */
export const SEQ_RETRIES = 3;

/** True for a unique violation on the (conversation_id, seq) index. */
export function isSeqConflict(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === '23505') return true;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('messages_conversation_seq_idx') ||
    message.includes('duplicate key value')
  );
}
