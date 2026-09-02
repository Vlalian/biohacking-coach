import { describe, it, expect, vi, beforeEach } from 'vitest';

// `proposeDetectedActivities` became `proposeDetectedActivities` on this branch:
// the upload no longer imports anything, it proposes. Renamed here rather than
// aliased, because a test that still says "import" would keep describing the
// behaviour showable-version/14 was filed to remove.
const { resolveAthleteId, proposeDetectedActivities, revalidatePath } = vi.hoisted(() => ({
  resolveAthleteId: vi.fn(),
  proposeDetectedActivities: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('./current-actor', () => ({ resolveAthleteId }));
vi.mock('@/features/garmin/garmin-import', () => ({ proposeDetectedActivities }));

const { uploadGarminAction } = await import('./garmin-actions');

/**
 * The upload boundary. Parsing is proven in the Garmin feature's own tests; what
 * is asserted here is that nothing reaches the parser it should not — a form
 * field that is not a file, an empty file, or a request from nobody.
 *
 * The empty check comes first deliberately: a zero-byte file is the shape of an
 * abandoned file picker, and answering it without a database round trip keeps
 * the common mistake cheap.
 */
const ATHLETE = 'athlete_1';

function upload(file: unknown): FormData {
  const form = new FormData();
  if (file !== undefined) form.set('file', file as string | Blob);
  return form;
}

function fitFile(bytes = [0x0e, 0x10], name = 'activity.fit'): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/octet-stream' });
}

beforeEach(() => {
  resolveAthleteId.mockReset();
  proposeDetectedActivities.mockReset();
  revalidatePath.mockClear();
});

describe('uploadGarminAction', () => {
  it('imports the uploaded file for the signed-in athlete', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    proposeDetectedActivities.mockResolvedValue({ ok: true, imported: 1 });

    const result = await uploadGarminAction(upload(fitFile()));

    expect(result).toEqual({ ok: true, imported: 1 });
    const call = proposeDetectedActivities.mock.calls[0][0];
    expect(call.athleteId).toBe(ATHLETE);
    expect(call.filename).toBe('activity.fit');
    // The bytes are handed on as a Buffer, not the File — the feature parses
    // bytes and should never need to know it came from a form.
    expect(Buffer.isBuffer(call.buffer)).toBe(true);
    expect([...call.buffer]).toEqual([0x0e, 0x10]);
  });

  it('rejects a zero-byte file before resolving anyone', async () => {
    const result = await uploadGarminAction(upload(new File([], 'empty.fit')));

    expect(result).toEqual({ ok: false, reason: 'empty' });
    expect(resolveAthleteId).not.toHaveBeenCalled();
    expect(proposeDetectedActivities).not.toHaveBeenCalled();
  });

  it('rejects a field that is not a file at all', async () => {
    // A hand-built request can put anything in a form field; "empty" is the
    // honest answer to "you did not give me a file".
    const result = await uploadGarminAction(upload('not-a-file'));

    expect(result).toEqual({ ok: false, reason: 'empty' });
    expect(proposeDetectedActivities).not.toHaveBeenCalled();
  });

  it('rejects a form with no file field', async () => {
    const result = await uploadGarminAction(upload(undefined));

    expect(result).toEqual({ ok: false, reason: 'empty' });
    expect(proposeDetectedActivities).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request without reading the file', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await uploadGarminAction(upload(fitFile()));

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(proposeDetectedActivities).not.toHaveBeenCalled();
  });

  it('revalidates nothing when the import fails', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    proposeDetectedActivities.mockResolvedValue({ ok: false, reason: 'unreadable' });

    await uploadGarminAction(upload(fitFile()));

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
