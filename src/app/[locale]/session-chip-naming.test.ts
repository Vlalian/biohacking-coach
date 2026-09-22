import { describe, it, expect } from 'vitest';
import { filesMatchingRaw, SWEEP_TIMEOUT_MS } from '@/test/source-sweep';

/**
 * `training-architecture/01`: the calendar chip is a **Session Chip**, and
 * "block" in this codebase means one of two other things.
 *
 * The word had come to carry three senses at once — this chip, a prompt section
 * (`prompt-blocks.ts` and its `block()` builder), and, since 2026-09-09, a
 * **Training Block**, the periodisation span the whole `training-architecture`
 * effort is built on. Training Block keeps the word, because it is what athletes
 * and Head Coaches actually say. The prompt-section sense is internal to prompt
 * assembly and never surfaces in conversation, so it keeps it too. The chip was
 * the cheapest of the three to move, and "chip" was already the word its own
 * glossary definition used.
 *
 * A rename is only worth doing once. This is the guard that keeps it done: the
 * assertion is an exact list rather than "the phrase is absent", so the one
 * legitimate survivor is *named* instead of pattern-matched around. A loose
 * "must not appear anywhere" check would have to be relaxed to let
 * `prompts.ts` through, and a relaxed check is one that passes for the wrong
 * reason.
 */
describe('nothing in src/ calls a Session Chip a block', () => {
  /**
   * Every `.ts`/`.tsx` under `src/`, tests included and comments with them —
   * the acceptance criterion names test names and comments as well as
   * identifiers, and the stale reference this rename started from lived in a
   * test file's comment. This file is the one exclusion, because it
   * necessarily contains the phrase it is looking for.
   */
  const filesSayingSessionBlock = () => filesMatchingRaw(/session[ _-]?blocks?/i, { self: import.meta.url });

  it('leaves nothing, now that the prompt-section sense went with the Weekly Session', () => {
    // `prompts.ts` used to say "── Weekly Session blocks ──" over the section
    // builders that assembled that prompt — `prompt-blocks.ts`'s sense of the
    // word, not the calendar's, and the issue was explicit that it stayed.
    // The Weekly Session is retired (`training-architecture/21`), and the
    // heading went with it; nothing in `src/` says it now.
    expect(filesSayingSessionBlock()).toEqual([]);
  }, SWEEP_TIMEOUT_MS);
});
