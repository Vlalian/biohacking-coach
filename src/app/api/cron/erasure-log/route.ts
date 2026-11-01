import { isCronRequest } from '@/lib/cron-auth';
import { erasureLogCutoff } from '@/features/erasure/erasure';
import { deleteErasureLogsBefore } from '@/features/erasure/erasure-repository';

/**
 * The erasure records' retention (`garmin-connect-api/09`), once a day
 * (`vercel.json`). An erasure leaves one record — the consents the account had
 * given, and when — as proof of consent; the Privacy Policy promises it is kept
 * three years and then deleted. This is the "then deleted".
 *
 * Once a day, not more: every scheduled query wakes the database, and a daily
 * deletion is all the promise needs.
 *
 * Only Vercel Cron may call it: `Authorization: Bearer $CRON_SECRET`, and with
 * no secret set the route refuses everyone.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  if (!isCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const deleted = await deleteErasureLogsBefore(erasureLogCutoff(new Date()));
  return Response.json({ deleted });
}
