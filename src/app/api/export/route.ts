import { getExportInput } from '@/features/erasure/export-repository';
import { exportFilename, toAthleteExport } from '@/features/erasure/export';
import { resolveErasureSubject } from '../../[locale]/current-actor';

/**
 * The athlete's data export, as a file they can save
 * (`showable-version/10`; `docs/nfr.md` PRIV-3, Articles 15 and 20).
 *
 * A Route Handler rather than a server action so the browser gets a real
 * download with a filename, instead of a JSON string the client has to turn into
 * a Blob. It is also what makes the "Download a copy first" link inside the
 * delete dialog work as a plain link: no client state, no model call, nothing to
 * fail between pressing it and the file arriving.
 *
 * The subject is resolved from the authenticated session and there is no
 * parameter naming an account (ADR 0006), so this can only ever export the
 * caller's own record.
 */

// Depends on who is signed in, so it can never be prerendered or cached.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const subject = await resolveErasureSubject();
  if (!subject.ok) {
    return new Response('Not authenticated', { status: 401 });
  }

  const now = new Date();
  const document = toAthleteExport(
    await getExportInput(subject.athleteId, subject.userId),
    now,
  );

  return new Response(JSON.stringify(document, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(now)}"`,
      // The file is the athlete's health-adjacent record. It must not sit in a
      // shared cache, and a stale copy would misrepresent what the app holds.
      'Cache-Control': 'no-store',
    },
  });
}
