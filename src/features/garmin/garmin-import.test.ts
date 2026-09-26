import { describe, it, expect, vi, beforeEach } from 'vitest';

const batch = vi.fn().mockResolvedValue(undefined);
const values = vi.fn((v: unknown) => ({ __stmt: v }));
const insert = vi.fn(() => ({ values }));
const getSessionsOnDates = vi.fn(async () => [] as unknown[]);

vi.mock('@/db', () => ({
  getDb: () => ({ insert, batch }),
}));
vi.mock('@/features/session/session-repository', () => ({ getSessionsOnDates }));

const { parseUpload, proposeDetectedActivities, proposeDetectedUpload } = await import('./garmin-import');
const { strToU8, zipSync } = await import('fflate');

// 90 minutes long on purpose: a fixture measured in seconds cannot tell a
// duration in minutes from one in seconds, and that is the mistake this file
// is guarding (a 90-minute ride rendered as "2 min" on the proposal card).
const GPX = `<?xml version="1.0"?>
<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Run</name><type>running</type><trkseg>
    <trkpt lat="55.0000" lon="12.0000"><ele>10</ele><time>2026-07-10T08:00:00Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>120</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="55.0001" lon="12.0000"><ele>11</ele><time>2026-07-10T09:30:00Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>124</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  </trkseg></trk>
</gpx>`;

function upload() {
  return proposeDetectedActivities({
    athleteId: 'athlete_1',
    filename: 'run.gpx',
    buffer: Buffer.from(GPX),
  });
}

/** Everything handed to `.values()` during the call. */
function written() {
  return values.mock.calls.map((c) => c[0] as Record<string, unknown>);
}

describe('proposeDetectedActivities', () => {
  beforeEach(() => {
    batch.mockClear();
    values.mockClear();
    insert.mockClear();
    getSessionsOnDates.mockClear();
    getSessionsOnDates.mockResolvedValue([]);
  });

  it('never writes a completed session — detection proposes, it never asserts', () => {
    // The rule from CONTEXT.md, as a test rather than a comment. This is the
    // whole of showable-version/14: the import used to write `completed` per
    // parsed activity, with no athlete in between and no way back.
    return upload().then(() => {
      for (const row of written()) {
        expect(row.status).toBeUndefined();
        expect(row.origin).toBeUndefined();
      }
    });
  });

  it('writes the activity as a pending proposal, with its streams inline', async () => {
    const result = await upload();

    expect(result).toEqual({ ok: true, count: 1 });
    // One atomic batch; one proposal row, not a session + streams + event.
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(1);

    const [proposal] = written();
    expect(proposal).toMatchObject({
      athleteId: 'athlete_1',
      date: '2026-07-10',
      type: 'Endurance',
      matchedSessionId: null,
    });
    expect((proposal.samples as { t: number[] }).t).toEqual([0, 5400]);
    // Minutes, not seconds — the parser already divides the file's elapsed
    // seconds by 60, and `sessions.duration` is minutes everywhere else. A
    // second divide in the UI turned this 90-minute ride into "2 min".
    expect(proposal.duration).toBe(90);
  });

  it('carries the matched Planned Session onto the proposal', async () => {
    getSessionsOnDates.mockResolvedValue([
      {
        id: 'planned_1',
        date: '2026-07-10',
        type: 'Endurance',
        status: 'planned',
        parked: false,
        dayOrder: 0,
      },
    ]);

    await upload();

    expect(getSessionsOnDates).toHaveBeenCalledWith('athlete_1', ['2026-07-10']);
    expect(written()[0].matchedSessionId).toBe('planned_1');
  });

  it('proposes without a match rather than dropping the activity', async () => {
    getSessionsOnDates.mockResolvedValue([
      {
        id: 'planned_1',
        date: '2026-07-10',
        type: 'Endurance',
        // Parked: the athlete has said this cannot happen as placed.
        status: 'planned',
        parked: true,
        dayOrder: 0,
      },
    ]);

    await upload();

    expect(written()).toHaveLength(1);
    expect(written()[0].matchedSessionId).toBeNull();
  });

  it('writes nothing for a malformed file', async () => {
    const result = await proposeDetectedActivities({
      athleteId: 'athlete_1',
      filename: 'broken.gpx',
      buffer: Buffer.from('not xml at all <<<'),
    });

    expect(result).toEqual({ ok: false, reason: 'unreadable' });
    expect(batch).not.toHaveBeenCalled();
    expect(values).not.toHaveBeenCalled();
    // Not even the plan is read for a file that never parsed.
    expect(getSessionsOnDates).not.toHaveBeenCalled();
  });

  // garmin-integration/03: the same key a history import dedupes on, so an
  // activity that arrived as a proposal is not imported again as history.
  it('stamps the external id on a detected activity', async () => {
    await upload();
    expect(written()[0]).toEqual(expect.objectContaining({ externalId: 'garmin:2026-07-10T08:00:00.000Z' }));
  });
});

// garmin-integration/03: the one parse both uploads share, so a file fails the
// same way through either button.
describe('parseUpload', () => {
  it('reads a GPX file into its activities', async () => {
    const read = await parseUpload('run.gpx', Buffer.from(GPX));
    expect(read.ok && read.sessions.map((s) => s.date)).toEqual(['2026-07-10']);
  });

  it('reads a FIT file into its activities, by a name in any case', async () => {
    const { buildFitFile } = await import('./fit-fixture');
    const read = await parseUpload('ride.Fit', buildFitFile());
    expect(read.ok && read.sessions).toHaveLength(1);
  });

  it('carries a FIT file’s own failure reason through', async () => {
    expect(await parseUpload('x.FIT', Buffer.from('not fit'))).toEqual({ ok: false, reason: 'not-a-fit-file' });
  });

  it('calls a GPX with no activity unreadable, not empty', async () => {
    expect(await parseUpload('empty.gpx', Buffer.from('<gpx></gpx>'))).toEqual({ ok: false, reason: 'unreadable' });
  });
});


/** `garmin-integration/04` — detection reads its file from Blob, which may hold a small zip. */
describe('proposeDetectedUpload', () => {
  const GPX2 = GPX.replaceAll('2026-07-10', '2026-07-11');

  beforeEach(() => {
    batch.mockClear();
    values.mockClear();
    getSessionsOnDates.mockResolvedValue([]);
  });

  it('proposes a plain file exactly as the upload did', async () => {
    expect(await proposeDetectedUpload({ athleteId: 'athlete_1', name: 'run.gpx', bytes: strToU8(GPX) })).toEqual({ ok: true, count: 1 });
    expect(written()).toEqual([expect.objectContaining({ athleteId: 'athlete_1', date: '2026-07-10' })]);
  });

  it('proposes every activity in a zip, and skips a file that fails when another landed', async () => {
    const zip = zipSync({ 'a.gpx': strToU8(GPX), 'b.gpx': strToU8(GPX2), 'bad.fit': strToU8('nope') });
    expect(await proposeDetectedUpload({ athleteId: 'athlete_1', name: 'x.zip', bytes: zip })).toEqual({ ok: true, count: 2 });
    expect(written().map((r) => r.date)).toEqual(['2026-07-10', '2026-07-11']);
  });

  it('gives the first file’s reason when nothing in it landed', async () => {
    const zip = zipSync({ 'bad.fit': strToU8('nope'), 'empty.gpx': strToU8('<gpx/>') });
    expect(await proposeDetectedUpload({ athleteId: 'athlete_1', name: 'x.zip', bytes: zip })).toEqual({ ok: false, reason: 'not-a-fit-file' });
    expect(batch).not.toHaveBeenCalled();
  });

  it('calls a zip with no activity in it, or one that will not open, unreadable', async () => {
    const noActivity = zipSync({ 'notes.txt': strToU8('x') });
    expect(await proposeDetectedUpload({ athleteId: 'athlete_1', name: 'x.zip', bytes: noActivity })).toEqual({ ok: false, reason: 'unreadable' });
    expect(await proposeDetectedUpload({ athleteId: 'athlete_1', name: 'x.zip', bytes: strToU8('no zip') })).toEqual({ ok: false, reason: 'unreadable' });
    expect(batch).not.toHaveBeenCalled();
  });
});
