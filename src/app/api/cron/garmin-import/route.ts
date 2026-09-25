import { isCronRequest } from '@/lib/cron-auth';
import { IMPORT_TIME_BUDGET_MS, resumeImports, timeBudget } from '@/features/garmin/history-import-worker';
import { blobWorkerDeps, sweepOldBlobs } from '@/features/garmin/blob-store';

/**
 * The Garmin import cron (`garmin-integration/04`), every five minutes
 * (`vercel.json`). Two jobs:
 *
 * - **Carry imports on.** *Import* reads what fits in its first minute; every
 *   import still running that nothing has touched for a minute is picked up
 *   here, so a large export finishes whether or not the athlete stays.
 * - **Sweep.** Every Garmin upload older than a day is deleted, read or not,
 *   so a failed or abandoned import never leaves files in Blob.
 *
 * Only Vercel Cron may call it: `Authorization: Bearer $CRON_SECRET`, and with
 * no secret set the route refuses everyone.
 */

export const dynamic = 'force-dynamic';

// The import budget is 50 s; the sweep and the last write fit in the rest.
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const imports = await resumeImports(blobWorkerDeps, now, timeBudget(IMPORT_TIME_BUDGET_MS));
  const swept = await sweepOldBlobs(now);
  return Response.json({ imports, swept });
}
