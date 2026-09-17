/**
 * The generating state, as numbers and one poll (`training-architecture/29`,
 * decision 9 of the 2026-09-17 grill).
 *
 * A Coach generation — the week draft, the Briefing — takes tens of seconds
 * and runs where the surface cannot watch it: the draft in `after()` once the
 * page has responded, the Briefing behind one awaited action. What the surface
 * can do is say so, with a rough time, and re-read until the result lands.
 * Both halves live in `lib/` because two features read them: the athlete's
 * calendar slot and the Head Coach's plan page wait on the same draft, and the
 * Briefing quotes the same estimate.
 */

/** The rough time a Coach generation takes, as shown to whoever waits for it. One number, tuned here. */
export const COACH_EXPECTED_SECONDS = 30;

/** How often a surface waiting on a draft re-reads, and how long before it stops (triage 2026-09-17). */
export const GENERATION_POLL_MS = 10_000;
export const GENERATION_POLL_LIMIT_MS = 120_000;

/**
 * Re-reads on a fixed interval until the limit, then gives up once. `refresh`
 * fires at every multiple of `intervalMs` up to and including `limitMs`;
 * `onGiveUp` follows the last one. The returned function stops the poll — the
 * card's unmount, when the draft has landed and the parent renders it instead.
 *
 * Framework-free on purpose: the one timer in the app, testable with fake
 * timers and no component harness.
 */
export function startGenerationPoll(
  refresh: () => void,
  onGiveUp: () => void,
  { intervalMs, limitMs }: { intervalMs: number; limitMs: number },
): () => void {
  let elapsed = 0;
  let handle: ReturnType<typeof setTimeout> | undefined;
  const tick = () => {
    elapsed += intervalMs;
    refresh();
    if (elapsed >= limitMs) {
      onGiveUp();
      return;
    }
    handle = setTimeout(tick, intervalMs);
  };
  handle = setTimeout(tick, intervalMs);
  return () => clearTimeout(handle);
}
