import { describe, it, expect, vi, beforeEach } from 'vitest';

const batch = vi.fn().mockResolvedValue(undefined);
const values = vi.fn((v: unknown) => ({ __stmt: v }));
const insert = vi.fn(() => ({ values }));
const getSessionsOnDates = vi.fn(async () => [] as unknown[]);

vi.mock('@/db', () => ({
  getDb: () => ({ insert, batch }),
}));
vi.mock('@/features/session/session-repository', () => ({ getSessionsOnDates }));

const { proposeDetectedActivities } = await import('./garmin-import');

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
});
