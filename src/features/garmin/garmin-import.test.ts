import { describe, it, expect, vi, beforeEach } from 'vitest';

const batch = vi.fn().mockResolvedValue(undefined);
const values = vi.fn((v: unknown) => ({ __stmt: v }));
const insert = vi.fn(() => ({ values }));

vi.mock('@/db', () => ({
  getDb: () => ({ insert, batch }),
}));

const { importGarminSessions } = await import('./garmin-import');

const GPX = `<?xml version="1.0"?>
<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Run</name><type>running</type><trkseg>
    <trkpt lat="55.0000" lon="12.0000"><ele>10</ele><time>2026-07-10T08:00:00Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="55.0001" lon="12.0000"><ele>11</ele><time>2026-07-10T08:00:10Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>124</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  </trkseg></trk>
</gpx>`;

describe('importGarminSessions', () => {
  beforeEach(() => {
    batch.mockClear();
    values.mockClear();
    insert.mockClear();
  });

  it('writes the session, its streams, and the event in one batch', async () => {
    const result = await importGarminSessions({
      athleteId: 'athlete_1',
      filename: 'run.gpx',
      buffer: Buffer.from(GPX),
    });

    expect(result).toEqual({ ok: true, count: 1 });
    // One atomic batch; three writes for one session.
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(3);

    const written = values.mock.calls.map((c) => c[0] as Record<string, unknown>);
    const sessionRow = written.find((w) => w.origin === 'garmin')!;
    expect(sessionRow).toMatchObject({
      athleteId: 'athlete_1',
      origin: 'garmin',
      status: 'completed',
      date: '2026-07-10',
    });

    const streamRow = written.find((w) => 'samples' in w)!;
    expect(streamRow.sessionId).toBe(sessionRow.id);
    expect((streamRow.samples as { t: number[] }).t).toEqual([0, 10]);

    const eventRow = written.find((w) => w.type === 'garmin_imported')!;
    expect(eventRow).toMatchObject({ actorType: 'athlete', actorId: 'athlete_1' });
    // The event payload carries ids and the derived date — no raw file metadata.
    expect(eventRow.payload).toEqual({ sessionId: sessionRow.id, date: '2026-07-10' });
  });

  it('writes nothing for a malformed file', async () => {
    const result = await importGarminSessions({
      athleteId: 'athlete_1',
      filename: 'broken.gpx',
      buffer: Buffer.from('not xml at all <<<'),
    });

    expect(result).toEqual({ ok: false, reason: 'unreadable' });
    expect(batch).not.toHaveBeenCalled();
    expect(values).not.toHaveBeenCalled();
  });
});
