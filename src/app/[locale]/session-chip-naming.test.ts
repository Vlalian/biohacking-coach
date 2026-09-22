import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';

/**
 * These tests walk every file under `src/` and read it. That takes well under a
 * second on an ordinary run and past the 5 s default when the suite runs with
 * v8 coverage instrumentation — which is the hardening gate's first step, so the
 * flake stopped the gate rather than a test run. The assertions are unchanged;
 * only the time the walk is allowed to take is (`code-health/11`).
 */
vi.setConfig({ testTimeout: 30_000 });


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
  // Resolved from this file, never from `process.cwd()`: the mutation gate runs
  // the suite from a sandbox copy with a different working directory, where a
  // cwd-relative path silently finds nothing and the assertion below passes
  // while proving nothing.
  const SRC = fileURLToPath(new URL('../..', import.meta.url));

  /**
   * Every `.ts`/`.tsx` under `src/`, tests included — the acceptance criterion
   * names test names and comments as well as identifiers, and the stale
   * reference this rename started from lived in a test file's comment.
   *
   * This file is the one exclusion, because it necessarily contains the phrase
   * it is looking for.
   */
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      if (!/\.tsx?$/.test(entry.name)) return [];
      return entry.name === 'session-chip-naming.test.ts' ? [] : [full];
    });
  }

  /** Repo-relative paths of files naming a *session* block, in any casing. */
  function filesSayingSessionBlock(): string[] {
    return sourceFiles(SRC)
      .filter((file) => /session[ _-]?blocks?/i.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC.length).split(sep).join('/'))
      .sort();
  }

  it('leaves nothing, now that the prompt-section sense went with the Weekly Session', () => {
    // `prompts.ts` used to say "── Weekly Session blocks ──" over the section
    // builders that assembled that prompt — `prompt-blocks.ts`'s sense of the
    // word, not the calendar's, and the issue was explicit that it stayed.
    // The Weekly Session is retired (`training-architecture/21`), and the
    // heading went with it; nothing in `src/` says it now.
    expect(filesSayingSessionBlock()).toEqual([]);
  });
});
