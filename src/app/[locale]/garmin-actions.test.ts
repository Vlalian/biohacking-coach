import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  resolveAthleteId,
  resolveAthlete,
  proposeDetectedUpload,
  acceptDetectedActivity,
  declineDetectedActivity,
  undoDetectedImport,
  revalidatePath,
  after,
  startHistoryImport,
  removeImportedHistory,
  latestHistoryImport,
  runHistoryImport,
  fetchBlob,
  deleteBlob,
  blobWorkerDeps,
} = vi.hoisted(() => {
  const fetchBlob = vi.fn();
  const deleteBlob = vi.fn();
  return {
    resolveAthleteId: vi.fn(),
    resolveAthlete: vi.fn(),
    proposeDetectedUpload: vi.fn(),
    acceptDetectedActivity: vi.fn(),
    declineDetectedActivity: vi.fn(),
    undoDetectedImport: vi.fn(),
    revalidatePath: vi.fn(),
    after: vi.fn(),
    startHistoryImport: vi.fn(),
    removeImportedHistory: vi.fn(),
    latestHistoryImport: vi.fn(),
    runHistoryImport: vi.fn(),
    fetchBlob,
    deleteBlob,
    blobWorkerDeps: { fetchBlob, deleteBlob, today: () => '2026-09-25' },
  };
});

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('next/server', () => ({ after }));
vi.mock('./current-actor', () => ({ resolveAthleteId, resolveAthlete }));
vi.mock('@/features/garmin/garmin-import', () => ({ proposeDetectedUpload }));
vi.mock('@/features/garmin/history-import-service', () => ({ startHistoryImport, removeImportedHistory, latestHistoryImport }));
vi.mock('@/features/garmin/history-import-worker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/garmin/history-import-worker')>()),
  runHistoryImport,
}));
vi.mock('@/features/garmin/blob-store', () => ({ fetchBlob, deleteBlob, blobWorkerDeps }));
vi.mock('@/features/garmin/detected-activity', () => ({
  acceptDetectedActivity,
  declineDetectedActivity,
  undoDetectedImport,
}));

const {
  prepareGarminUploadAction,
  importDetectedFromBlobAction,
  startHistoryImportAction,
  historyImportStatusAction,
  acceptDetectedActivityAction,
  declineDetectedActivityAction,
  undoDetectedImportAction,
  removeImportedHistoryAction,
} = await import('./garmin-actions');

const ATHLETE = 'athlete_1';
const HOST = 'https://store1.private.blob.vercel-storage.com';
const detectionUrl = (name: string, athlete = ATHLETE) => `${HOST}/garmin/detection/${athlete}/${name}`;
const historyUrl = (name: string, athlete = ATHLETE) => `${HOST}/garmin/history/${athlete}/${name}`;

beforeEach(() => {
  vi.resetAllMocks();
});

/**
 * `garmin-integration/04` — the upload's first step. The client learns where
 * it may put its file; the answer comes from the session, never the request.
 */
describe('prepareGarminUploadAction', () => {
  it('gives the signed-in athlete their own prefix', async () => {
    resolveAthlete.mockResolvedValue({ id: ATHLETE, profile: null });
    expect(await prepareGarminUploadAction('history')).toEqual({ ok: true, pathPrefix: `garmin/history/${ATHLETE}/` });
    expect(await prepareGarminUploadAction('detection')).toEqual({ ok: true, pathPrefix: `garmin/detection/${ATHLETE}/` });
  });

  it('refuses a history upload once the lock is taken, before any bytes move', async () => {
    resolveAthlete.mockResolvedValue({ id: ATHLETE, profile: { historyImportedAt: '2026-09-20T10:00:00.000Z' } });
    expect(await prepareGarminUploadAction('history')).toEqual({ ok: false, reason: 'locked' });
  });

  it('refuses nobody, and a kind it does not know', async () => {
    resolveAthlete.mockResolvedValue(null);
    expect(await prepareGarminUploadAction('history')).toEqual({ ok: false, reason: 'not-authenticated' });
    resolveAthlete.mockResolvedValue({ id: ATHLETE, profile: null });
    expect(await prepareGarminUploadAction('x' as never)).toEqual({ ok: false, reason: 'bad-kind' });
  });
});

/**
 * The detection upload, once its file is in Blob. What is asserted here is the
 * seam: whose file it may read, that it always deletes it, and that only a
 * success refreshes the calendar. Parsing and proposing are tested in the
 * Garmin feature.
 */
describe('importDetectedFromBlobAction', () => {
  const BYTES = new Uint8Array([1, 2, 3]);

  it('the detection upload imports from the blob and deletes it', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    fetchBlob.mockResolvedValue(BYTES);
    proposeDetectedUpload.mockResolvedValue({ ok: true, count: 1 });

    expect(await importDetectedFromBlobAction(detectionUrl('ride%20one-Ab1.fit'))).toEqual({ ok: true, count: 1 });
    expect(fetchBlob).toHaveBeenCalledWith(detectionUrl('ride%20one-Ab1.fit'));
    expect(proposeDetectedUpload).toHaveBeenCalledWith({ athleteId: ATHLETE, name: 'ride one-Ab1.fit', bytes: BYTES });
    expect(deleteBlob).toHaveBeenCalledWith(detectionUrl('ride%20one-Ab1.fit'));
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('refuses a blob URL outside the signed-in athlete’s detection prefix, touching nothing', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    for (const url of [detectionUrl('f.fit', 'athlete_2'), historyUrl('f.fit'), 'https://evil.example/garmin/detection/athlete_1/f.fit']) {
      expect(await importDetectedFromBlobAction(url)).toEqual({ ok: false, reason: 'not-yours' });
    }
    expect(fetchBlob).not.toHaveBeenCalled();
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it('refuses a signed-out request without reading anything', async () => {
    resolveAthleteId.mockResolvedValue(null);
    expect(await importDetectedFromBlobAction(detectionUrl('f.fit'))).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(fetchBlob).not.toHaveBeenCalled();
  });

  it('answers unreadable for a blob that is gone', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    fetchBlob.mockResolvedValue(null);
    expect(await importDetectedFromBlobAction(detectionUrl('f.fit'))).toEqual({ ok: false, reason: 'unreadable' });
    expect(proposeDetectedUpload).not.toHaveBeenCalled();
  });

  it('deletes the blob and refreshes nothing when the file fails, and when proposing throws', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    fetchBlob.mockResolvedValue(BYTES);
    proposeDetectedUpload.mockResolvedValue({ ok: false, reason: 'corrupt' });
    expect(await importDetectedFromBlobAction(detectionUrl('f.fit'))).toEqual({ ok: false, reason: 'corrupt' });
    expect(deleteBlob).toHaveBeenCalledTimes(1);

    proposeDetectedUpload.mockRejectedValue(new Error('db down'));
    await expect(importDetectedFromBlobAction(detectionUrl('f.fit'))).rejects.toThrow('db down');
    expect(deleteBlob).toHaveBeenCalledTimes(2);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('still answers when the delete fails — the sweep takes what is left', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    fetchBlob.mockResolvedValue(BYTES);
    proposeDetectedUpload.mockResolvedValue({ ok: true, count: 2 });
    deleteBlob.mockRejectedValue(new Error('blob down'));
    expect(await importDetectedFromBlobAction(detectionUrl('f.fit'))).toEqual({ ok: true, count: 2 });
  });
});

/**
 * The three answers to a Detected Activity. The rules — whose proposal it is,
 * whether the target session may take it, what an undo may touch — live in
 * `features/garmin/detected-activity` and are tested there. Asserted here is
 * the seam: the athlete comes from the session, the rating travels with the
 * accept (it *is* the accept), and only a success refreshes the calendar.
 */
describe('acceptDetectedActivityAction', () => {
  const RATING = { body: 4, mind: 3, comment: 'Solid.' };

  it('accepts as the signed-in athlete, rating included, and refreshes the shell', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    acceptDetectedActivity.mockResolvedValue({ ok: true, sessionId: 'sess_1' });

    const result = await acceptDetectedActivityAction('act_1', 'sess_1', RATING);

    expect(result).toEqual({ ok: true, sessionId: 'sess_1' });
    expect(acceptDetectedActivity).toHaveBeenCalledWith({
      athleteId: ATHLETE,
      activityId: 'act_1',
      targetSessionId: 'sess_1',
      ...RATING,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('refuses a signed-out request without touching the proposal', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await acceptDetectedActivityAction('act_1', null, RATING);

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(acceptDetectedActivity).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('passes a refusal through and refreshes nothing', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    acceptDetectedActivity.mockResolvedValue({ ok: false, reason: 'bad-target' });

    const result = await acceptDetectedActivityAction('act_1', 'sess_9', RATING);

    expect(result).toEqual({ ok: false, reason: 'bad-target' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('declineDetectedActivityAction', () => {
  it('declines as the signed-in athlete and refreshes the shell', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    declineDetectedActivity.mockResolvedValue({ ok: true });

    const result = await declineDetectedActivityAction('act_1');

    expect(result).toEqual({ ok: true });
    expect(declineDetectedActivity).toHaveBeenCalledWith({ athleteId: ATHLETE, activityId: 'act_1' });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('refuses a signed-out request without touching the proposal', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await declineDetectedActivityAction('act_1');

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(declineDetectedActivity).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('passes a refusal through and refreshes nothing', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    declineDetectedActivity.mockResolvedValue({ ok: false, reason: 'not-owner' });

    const result = await declineDetectedActivityAction('act_1');

    expect(result).toEqual({ ok: false, reason: 'not-owner' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('undoDetectedImportAction', () => {
  it('undoes as the signed-in athlete and refreshes the shell', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    undoDetectedImport.mockResolvedValue({ ok: true });

    const result = await undoDetectedImportAction('sess_1');

    expect(result).toEqual({ ok: true });
    expect(undoDetectedImport).toHaveBeenCalledWith({ athleteId: ATHLETE, sessionId: 'sess_1' });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('refuses a signed-out request without touching the session', async () => {
    resolveAthleteId.mockResolvedValue(null);

    const result = await undoDetectedImportAction('sess_1');

    expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(undoDetectedImport).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('passes a refusal through and refreshes nothing', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    undoDetectedImport.mockResolvedValue({ ok: false, reason: 'not-imported' });

    const result = await undoDetectedImportAction('sess_1');

    expect(result).toEqual({ ok: false, reason: 'not-imported' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

/**
 * `garmin-integration/04` — *Import*, once the files are in Blob. Every URL is
 * checked against the athlete's own prefix before anything is locked or read.
 */
describe('startHistoryImportAction', () => {
  const URLS = [historyUrl('export-Ab1.zip'), historyUrl('ride-Cd2.fit')];

  beforeEach(() => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    startHistoryImport.mockResolvedValue({ ok: true, importId: 'imp1' });
  });

  it('takes the lock, and starts reading in the background with the time budget', async () => {
    expect(await startHistoryImportAction(URLS)).toEqual({ ok: true });
    expect(startHistoryImport).toHaveBeenCalledWith(ATHLETE, URLS);
    expect(after).toHaveBeenCalledTimes(1);
    expect(runHistoryImport).not.toHaveBeenCalled();

    vi.useFakeTimers({ now: new Date('2026-09-25T12:00:00Z') });
    await after.mock.calls[0][0]();
    const [importId, deps, timeUp] = runHistoryImport.mock.calls[0];
    expect(importId).toBe('imp1');
    expect(deps).toBe(blobWorkerDeps);
    expect(timeUp()).toBe(false);
    vi.advanceTimersByTime(50_000);
    expect(timeUp()).toBe(true);
    vi.useRealTimers();
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('refuses a blob URL outside the signed-in athlete’s prefix', async () => {
    resolveAthleteId.mockResolvedValue('a1');
    expect(await startHistoryImportAction(['https://x.blob.vercel-storage.com/garmin/history/a2/f.zip'])).toEqual({ ok: false, reason: 'not-yours' });
    expect(await startHistoryImportAction([historyUrl('ok.zip', 'a1'), historyUrl('f.zip', 'a2')])).toEqual({ ok: false, reason: 'not-yours' });
    expect(await startHistoryImportAction([`${HOST}/garmin/detection/a1/f.zip`])).toEqual({ ok: false, reason: 'not-yours' });
    expect(startHistoryImport).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it('refuses no URLs, something that is not a list of URLs, and an anonymous caller', async () => {
    expect(await startHistoryImportAction([])).toEqual({ ok: false, reason: 'empty' });
    expect(await startHistoryImportAction('nope' as never)).toEqual({ ok: false, reason: 'empty' });
    expect(await startHistoryImportAction([42] as never)).toEqual({ ok: false, reason: 'not-yours' });
    expect(await startHistoryImportAction([null] as never)).toEqual({ ok: false, reason: 'not-yours' });
    resolveAthleteId.mockResolvedValue(null);
    expect(await startHistoryImportAction(URLS)).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(startHistoryImport).not.toHaveBeenCalled();
  });

  it('passes the lock through and starts nothing', async () => {
    startHistoryImport.mockResolvedValue({ ok: false, reason: 'locked' });
    expect(await startHistoryImportAction(URLS)).toEqual({ ok: false, reason: 'locked' });
    expect(after).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('historyImportStatusAction', () => {
  it('gives the athlete’s latest import as counts, without its blob URLs', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    latestHistoryImport.mockResolvedValue({ id: 'imp1', status: 'importing', blobUrls: ['secret'], cursor: 3, total: 1200, done: 340, skippedOld: 2100, failed: 0 });
    expect(await historyImportStatusAction()).toEqual({
      ok: true,
      summary: { status: 'importing', total: 1200, done: 340, skippedOld: 2100, failed: 0 },
    });
    expect(latestHistoryImport).toHaveBeenCalledWith(ATHLETE);
  });

  it('is null when there has been no import, and refuses nobody', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    latestHistoryImport.mockResolvedValue(null);
    expect(await historyImportStatusAction()).toEqual({ ok: true, summary: null });
    resolveAthleteId.mockResolvedValue(null);
    expect(await historyImportStatusAction()).toEqual({ ok: false, reason: 'not-authenticated' });
  });
});

describe('removeImportedHistoryAction', () => {
  it('removes the signed-in athlete’s imported history and refreshes', async () => {
    resolveAthleteId.mockResolvedValue(ATHLETE);
    removeImportedHistory.mockResolvedValue(undefined);

    expect(await removeImportedHistoryAction()).toEqual({ ok: true });
    expect(removeImportedHistory).toHaveBeenCalledWith(ATHLETE);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('refuses an anonymous caller', async () => {
    resolveAthleteId.mockResolvedValue(null);
    expect(await removeImportedHistoryAction()).toEqual({ ok: false, reason: 'not-authenticated' });
    expect(removeImportedHistory).not.toHaveBeenCalled();
  });
});

