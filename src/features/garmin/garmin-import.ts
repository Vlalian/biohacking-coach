import { randomUUID } from 'node:crypto';
import { getDb } from '@/db';
import { sessions, sessionStreams, events } from '@/db/schema';
import { parseFit, parseGpx } from './garmin';

export type ImportResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'unreadable' };

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

  const parsed = filename.toLowerCase().endsWith('.fit')
    ? await parseFit(buffer)
    : parseGpx(buffer);

  if (parsed.length === 0) return { ok: false, reason: 'unreadable' };

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
