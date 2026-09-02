/**
 * The rendered readiness tokens, for tests that assert none of them reached a
 * prompt (code-health/07).
 *
 * Shared rather than repeated in each spec because the three suites that check
 * this — the prompt renderers and both Coach services — must agree on what
 * "a readiness score reached the model" looks like. Repeated inline, a change to
 * the STATE line's format is three edits, and the one that gets missed is a test
 * that keeps passing while the thing it guards has moved.
 *
 * Each is matched by its own rendered token rather than a bare number, so an
 * unrelated digit elsewhere in a prompt cannot decide the result.
 */
export const READINESS_SCORE_TOKENS = [
  /body=\d/,
  /mental=\d/,
  /energy=\d/,
  /sleep=[\d.]+h/,
  /pulse=\d+bpm/,
] as const;
