import 'server-only';

import { deployEnv, resolveBaseURL } from '@/lib/deploy-origin';

/**
 * The history import's chained run (`garmin-integration/08`): a run that ends
 * its time budget with work left asks the cron import route to carry on at
 * once, instead of the import sitting idle until the next cron tick. The cron
 * stays as the safety net — a chain that fails here costs minutes, not the
 * import.
 */

/** The cron import route, which the chained run calls as Vercel Cron does. */
export const IMPORT_ROUTE_PATH = '/api/cron/garmin-import';

/** The query parameter that marks a request as a chained run, not the cron's tick. */
export const CHAINED_PARAM = 'chained';

/** How long the request waits for the route's answer — which comes at once, the run itself going on after it. */
const CHAIN_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Asks the cron import route for the next run, with the cron's own
 * `Authorization: Bearer $CRON_SECRET`. With no secret set, or no origin to
 * call, it asks nothing: the cron route would refuse it anyway. On a preview
 * behind Vercel's deployment protection the bypass secret goes along when the
 * project has one. Never throws, and logs no URL or secret.
 */
export async function requestNextImportRun(): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const origin = resolveBaseURL(deployEnv());
  if (!secret || !origin) return;

  const headers: Record<string, string> = { authorization: `Bearer ${secret}` };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  try {
    const response = await fetch(`${origin}${IMPORT_ROUTE_PATH}?${CHAINED_PARAM}=1`, {
      headers,
      signal: AbortSignal.timeout(CHAIN_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) console.error('history import chain refused', response.status);
  } catch {
    console.error('history import chain failed');
  }
}
