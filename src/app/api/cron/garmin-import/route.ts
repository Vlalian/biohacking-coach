import { after } from 'next/server';
import { isCronRequest } from '@/lib/cron-auth';
import {
  IMPORT_STALL_MS,
  IMPORT_TIME_BUDGET_MS,
  RESUME_AFTER_MS,
  resumeImports,
  timeBudget,
} from '@/features/garmin/history-import-worker';
import { blobWorkerDeps, listGarminBlobs, sweepOldBlobs, type ListedBlob } from '@/features/garmin/blob-store';
import { isDailyFullPass } from '@/features/garmin/blob-upload';
import { CHAINED_PARAM } from '@/features/garmin/import-chain';

/**
 * The Garmin import cron (`garmin-integration/04`), every five minutes
 * (`vercel.json`). Two jobs:
 *
 * - **Carry imports on.** *Import* reads what fits in its first minute; every
 *   import still running that nothing has touched for a minute is picked up
 *   here, so a large export finishes whether or not the athlete stays. One
 *   that has made no progress for 30 minutes is failed instead, and its
 *   files deleted (ruling 5a).
 * - **Sweep.** Every Garmin upload older than a day is deleted, read or not,
 *   so a failed or abandoned import never leaves files in Blob.
 *
 * **Blob first** (`garmin-integration/09`). A running import always has a file
 * in Blob, so the route lists Blob once and, with nothing there, answers
 * without touching the database — a query every five minutes kept Neon's
 * compute from ever suspending. The run that starts 03:00–03:04 UTC does the
 * full pass anyway, and so does any run whose listing fails.
 *
 * **Chained runs** (`garmin-integration/08`). A run that ran out of time with
 * work left calls this route again at once with `?chained=1`. That request is
 * answered straight away and the run goes on after the response, taking an
 * import without the minute's wait — the run that asked has stopped.
 *
 * Only Vercel Cron and a chained run may call it: `Authorization: Bearer
 * $CRON_SECRET`, and with no secret set the route refuses everyone.
 */

export const dynamic = 'force-dynamic';

// Fluid Compute's limit. The import budget leaves IMPORT_BUDGET_MARGIN_MS of it
// for the last step, the sweep and the write; route.test.ts pins the two.
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (new URL(request.url).searchParams.has(CHAINED_PARAM)) {
    after(() => importPass(new Date(), 0));
    return new Response(null, { status: 202 });
  }
  return Response.json(await importPass(new Date(), RESUME_AFTER_MS));
}

type PassResult = { imports: number; failed: number; swept: number; skipped?: true };

/** One run: Blob first, then the imports and the sweep when there is anything to do. */
async function importPass(now: Date, resumeAfterMs: number): Promise<PassResult> {
  const listed = await listOrNull();
  if (listed?.length === 0 && !isDailyFullPass(now)) return { imports: 0, failed: 0, swept: 0, skipped: true };

  const { resumed, failed } = await resumeImports(blobWorkerDeps, now, timeBudget(IMPORT_TIME_BUDGET_MS), IMPORT_STALL_MS, resumeAfterMs);
  const swept = await sweepOldBlobs(now, listed ?? undefined);
  return { imports: resumed, failed, swept };
}

/** Every Garmin upload, or null when Blob cannot be listed — then the full pass runs, so an outage never stops an import. */
async function listOrNull(): Promise<ListedBlob[] | null> {
  try {
    return await listGarminBlobs();
  } catch {
    console.error('garmin cron: blob listing failed');
    return null;
  }
}
