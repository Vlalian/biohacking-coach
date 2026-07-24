import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sessions, sessionStreams } from '@/db/schema';
import type { SessionInput, StreamsInput } from './build-dataset';

/**
 * The only place the Information View reads its inputs out of Postgres.
 *
 * Scoped to one athlete by construction: both queries filter on `athlete_id`
 * (the streams read joins through `sessions` to get there), so no shape of
 * this call returns another athlete's rows (ADR 0006).
 *
 * Returns the builder's input shape, not rows — the column set the dataset
 * needs and nothing else. Streams are large; they are fetched here because
 * zones and peaks read them, and this view is the rare reader they were kept
 * out of the `sessions` row for.
 */
export async function getInformationViewInputs(athleteId: string): Promise<{
  rows: SessionInput[];
  streams: StreamsInput;
}> {
  const db = getDb();

  const sessionRows = await db
    .select({
      id: sessions.id,
      date: sessions.date,
      status: sessions.status,
      isTraining: sessions.isTraining,
      type: sessions.type,
      title: sessions.title,
      duration: sessions.duration,
      sport: sessions.sport,
      summary: sessions.summary,
      feedbackBody: sessions.feedbackBody,
      feedbackMind: sessions.feedbackMind,
      feedbackComment: sessions.feedbackComment,
    })
    .from(sessions)
    .where(eq(sessions.athleteId, athleteId))
    .orderBy(asc(sessions.date), asc(sessions.dayOrder));

  const streamRows = await db
    .select({
      sessionId: sessionStreams.sessionId,
      samples: sessionStreams.samples,
    })
    .from(sessionStreams)
    .innerJoin(sessions, eq(sessionStreams.sessionId, sessions.id))
    .where(eq(sessions.athleteId, athleteId));

  const streams: StreamsInput = {};
  for (const row of streamRows) {
    const samples = row.samples;
    if (!samples || typeof samples !== 'object') continue;
    const { t, hr, powerW } = samples as {
      t?: unknown;
      hr?: unknown;
      powerW?: unknown;
    };
    if (!Array.isArray(t)) continue;
    streams[row.sessionId] = {
      t: t as number[],
      ...(Array.isArray(hr) ? { hr: hr as (number | null)[] } : {}),
      ...(Array.isArray(powerW) ? { powerW: powerW as (number | null)[] } : {}),
    };
  }

  return { rows: sessionRows, streams };
}
