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
 * Asks on a fixed interval whether the result has landed, until it has or the
 * limit passes. `tick` resolves true when it has — the poll ends there, with
 * no give-up; false keeps it waiting. `tick` runs at every multiple of
 * `intervalMs` up to and including `limitMs`, and `onGiveUp` follows the last
 * false. The returned function stops the poll — the card's unmount.
 *
 * The tick is a *read*, never a page refresh: a refresh re-renders the app
 * shell, whose `after()` would start the very generation being waited on
 * again (review of the 24+29 batch, 2026-09-17). The caller refreshes once,
 * on the landing.
 *
 * Framework-free on purpose: the one timer in the app, testable with fake
 * timers and no component harness.
 */
export function startGenerationPoll(
  tick: () => Promise<boolean>,
  onGiveUp: () => void,
  { intervalMs, limitMs }: { intervalMs: number; limitMs: number },
): () => void {
  let elapsed = 0;
  let stopped = false;
  let handle: ReturnType<typeof setTimeout> | undefined;
  const ask = async () => {
    elapsed += intervalMs;
    // A rejected read (a network blip on the action) is "not yet", never a
    // frozen card: the poll goes on and still gives up at the limit.
    // Stryker disable next-line ArrowFunction — `() => undefined` is the same falsy "not landed"; no test can tell them apart because nothing should.
    const landed = await tick().catch(() => false);
    if (landed || stopped) return;
    if (elapsed >= limitMs) {
      onGiveUp();
      return;
    }
    handle = setTimeout(ask, intervalMs);
  };
  handle = setTimeout(ask, intervalMs);
  return () => {
    stopped = true;
    clearTimeout(handle);
  };
}
