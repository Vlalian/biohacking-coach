/**
 * Render timing (`code-health/09`): how long a render's read groups take, so a
 * slow page can be split into cold start, database wake and queries before
 * anything else is tuned.
 *
 * **Off by default.** Only `RENDER_TIMING=1` turns it on — set on Vercel for a
 * measuring run and removed after. It logs the same way `coach-log.ts` does:
 * one JSON line on `console.warn`, which Vercel's runtime logs keep, carrying
 * a fixed label and a duration and nothing that identifies anyone.
 *
 * A failed read is passed through untouched and not logged: a timing for work
 * that did not finish would be a number about nothing.
 */
export async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  if (process.env.RENDER_TIMING !== '1') return work();
  const start = performance.now();
  const value = await work();
  const ms = Math.round(performance.now() - start);
  console.warn(JSON.stringify({ event: 'render_timing', label, ms }));
  return value;
}
