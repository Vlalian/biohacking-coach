import { getDb } from '@/db';
import { detectedActivities } from '@/db/schema';
import { getSessionsOnDates } from '@/features/session/session-repository';
import { parseFit, parseGpx, type FitParseFailure, type ParsedSession } from './garmin';
import { matchActivities } from './match-activities';

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
 * Turns an uploaded Garmin file into **proposed** Detected Activities.
 *
 * `CONTEXT.md` states the rule this function exists to keep: detection
 * *proposes, it never asserts* — it never writes `completed` and never writes
 * `skipped` on its own, and the athlete's Session Reflection is the gesture
 * that commits an activity to the immutable record. Until 2026-08-26 this
 * function did the opposite: it inserted a session with `status: 'completed'`
 * per parsed activity, matched nothing against the Week Plan, and left the
 * result frozen and undeletable (showable-version/14).
 *
 * So nothing here touches `sessions`. Each activity is reconciled against the
 * day's Planned Sessions and parked in `detected_activities`, where it waits
 * for the athlete. Accepting is `acceptDetectedActivity`; declining deletes
 * the row and the calendar is untouched, because it was never touched.
 *
 * The `athleteId` is the caller's own, resolved upstream from the
 * authenticated session — never from the upload request (ADR 0006). Parsing
 * and validation still finish *before* any write, so a malformed or empty file
 * yields a reason and touches nothing.
 *
 * Raw file metadata is not interpolated anywhere near a prompt, and a pending
 * proposal is not plan material: nothing assembles prompts from this table.
 */
export async function proposeDetectedActivities(params: {
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
  // Only the days the file actually covers are read, and the match is decided
  // before the write so the proposal already knows what it would complete.
  const days = [...new Set(parsed.map((p) => p.date))];
  const matched = matchActivities(parsed, await getSessionsOnDates(athleteId, days));

  const writes = matched.map(({ activity, matchedSessionId }) =>
    db.insert(detectedActivities).values({
      athleteId,
      date: activity.date,
      type: activity.sessionType,
      sport: activity.sport,
      duration: activity.duration,
      note: activity.note,
      startTime: activity.startTime ? new Date(activity.startTime) : null,
      summary: activity.summary,
      samples: activity.streams,
      matchedSessionId,
    }),
  );

  // A batch needs at least one statement; parsed.length > 0 guarantees one.
  await db.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);

  return { ok: true, count: parsed.length };
}
