import { randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import { sessions, sessionStreams, events } from '@/db/schema';
import { parseFit, parseGpx, type FitParseFailure, type ParsedSession } from './garmin';

/**
 * Why an upload did not land, in cases the athlete can act on differently.
 *
 * One message for wrong-format, corrupt and empty is what turns a recoverable
 * mistake into a dead end for a tester who cannot ask (showable-version/06):
 * "try a .fit" is useless advice to someone who already uploaded one that was
 * truncated. `no-sessions` is the file that decoded fine and simply held no
 * activity.
 */
export type ImportFailure = FitParseFailure | 'no-sessions';

export type ImportResult =
  | { ok: true; count: number }
  | { ok: false; reason: ImportFailure };

/**
 * Turns an uploaded Garmin file into persisted sessions.
 *
 * The `athleteId` is the caller's own, resolved upstream from the authenticated
 * session — never from the upload request (ADR 0006). Parsing and validation
 * finish *before* any write: a malformed or empty file yields `unreadable` and
 * touches nothing, so a failed upload never leaves an orphaned session, stream,
 * or event behind.
 *
 * Each parsed session and its streams, provenance, and `garmin_imported` event
 * are written in one `db.batch` transaction — the atomic primitive on the
 * neon-http driver. Garmin-origin sessions are `origin: 'garmin'`, which every
 * edit/delete guard keys off to keep device-recorded facts read-only.
 *
 * Raw file metadata is not interpolated anywhere near a prompt: the event
 * payload carries only ids and the derived date, and sanitisation policy for the
 * stored fields is deferred to the security-hardening ticket.
 */
export async function importGarminSessions(params: {
  athleteId: string;
  filename: string;
  buffer: Buffer;
}): Promise<ImportResult> {
  const { athleteId, filename, buffer } = params;

  const isFit = filename.toLowerCase().endsWith('.fit');

  let parsed: ParsedSession[];
  if (isFit) {
    const result = await parseFit(buffer);
    // A FIT file reports which way it failed; that reason is carried through to
    // the athlete rather than flattened into one generic message.
    if (!result.ok) return { ok: false, reason: result.reason };
    parsed = result.sessions;
  } else {
    parsed = parseGpx(buffer);
  }

  if (parsed.length === 0) {
    // For FIT this genuinely means "read fine, held no activity": the header and
    // checksum were verified before decoding, so the file is sound and simply
    // carries no session. `parseGpx` returns the same empty list for malformed
    // XML as for a valid track-less file and cannot tell them apart, so GPX
    // stays on the honest generic reason rather than claiming the file was fine.
    return { ok: false, reason: isFit ? 'no-sessions' : 'unreadable' };
  }

  const db = getDb();
  const writes = parsed.flatMap((p) => {
    const sessionId = randomUUID();
    return [
      db.insert(sessions).values({
        id: sessionId,
        athleteId,
        date: p.date,
        type: p.sessionType,
        origin: 'garmin',
        status: 'completed', // device-recorded: it happened
        isTraining: true,
        duration: p.duration,
        note: p.note,
        dayOrder: 0,
        startTime: p.startTime ? new Date(p.startTime) : null,
        sport: p.sport,
        summary: p.summary,
      }),
      db.insert(sessionStreams).values({ sessionId, samples: p.streams }),
      db.insert(events).values({
        athleteId,
        actorType: 'athlete',
        actorId: athleteId,
        type: 'garmin_imported',
        payload: { sessionId, date: p.date },
      }),
    ];
  });

  // A batch needs at least one statement; parsed.length > 0 guarantees three.
  await db.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);

  return { ok: true, count: parsed.length };
}
