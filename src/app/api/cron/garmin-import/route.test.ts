import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `garmin-integration/04`, `08`, `09` — the cron that carries imports on,
 * sweeps what Blob still holds after a day, leaves the database alone when
 * Blob is empty, and takes a chained run at once. Blob and the worker are
 * mocked; the secret is a stub, never a real one.
 */
const { resumeImports, sweepOldBlobs, listGarminBlobs, blobWorkerDeps, after } = vi.hoisted(() => ({
  resumeImports: vi.fn(),
  sweepOldBlobs: vi.fn(),
  listGarminBlobs: vi.fn(),
  blobWorkerDeps: { fetchBlob: vi.fn(), deleteBlob: vi.fn(), today: () => '2026-09-25' },
  after: vi.fn(),
}));
vi.mock('@/features/garmin/history-import-worker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/garmin/history-import-worker')>()),
  resumeImports,
}));
vi.mock('@/features/garmin/blob-store', () => ({ sweepOldBlobs, listGarminBlobs, blobWorkerDeps }));
vi.mock('next/server', () => ({ after }));

const route = await import('./route');
const { IMPORT_TIME_BUDGET_MS, IMPORT_BUDGET_MARGIN_MS } = await import('@/features/garmin/history-import-worker');

const call = (authorization?: string, query = '') =>
  route.GET(new Request(`http://localhost/api/cron/garmin-import${query}`, { headers: authorization ? { authorization } : {} }));

const LISTED = [{ url: 'https://s.private.blob.vercel-storage.com/garmin/history/a1/x.zip', uploadedAt: new Date('2026-09-25T11:00:00Z') }];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET', 'test-secret');
  resumeImports.mockResolvedValue({ resumed: 2, failed: 1 });
  sweepOldBlobs.mockResolvedValue(3);
  listGarminBlobs.mockResolvedValue(LISTED);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('GET /api/cron/garmin-import', () => {
  it('answers 401 without the bearer secret, lists nothing in Blob and runs nothing', async () => {
    for (const header of [undefined, 'Bearer wrong', 'test-secret']) {
      for (const query of ['', '?chained=1']) {
        const response = await call(header, query);
        expect(response.status).toBe(401);
        expect(await response.text()).toBe('Unauthorized');
      }
    }
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
    expect(listGarminBlobs).not.toHaveBeenCalled();
    expect(resumeImports).not.toHaveBeenCalled();
    expect(sweepOldBlobs).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it('with files in Blob, runs importing rows, fails the stalled ones, and sweeps from the same listing', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-25T12:00:00Z') });
    const response = await call('Bearer test-secret');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imports: 2, failed: 1, swept: 3 });
    const [deps, now, timeUp, stallAfterMs, resumeAfterMs] = resumeImports.mock.calls[0];
    expect(stallAfterMs).toBe(30 * 60 * 1000);
    expect(resumeAfterMs).toBe(60_000);
    expect(deps).toBe(blobWorkerDeps);
    expect(now).toEqual(new Date('2026-09-25T12:00:00Z'));
    expect(timeUp()).toBe(false);
    vi.advanceTimersByTime(IMPORT_TIME_BUDGET_MS);
    expect(timeUp()).toBe(true);
    expect(listGarminBlobs).toHaveBeenCalledTimes(1);
    expect(sweepOldBlobs).toHaveBeenCalledWith(new Date('2026-09-25T12:00:00Z'), LISTED);
  });

  it('with Blob empty, answers at once and touches no database (garmin-integration/09)', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-02T14:05:00Z') });
    listGarminBlobs.mockResolvedValue([]);
    const response = await call('Bearer test-secret');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imports: 0, failed: 0, swept: 0, skipped: true });
    expect(resumeImports).not.toHaveBeenCalled();
    expect(sweepOldBlobs).not.toHaveBeenCalled();
  });

  it('with Blob empty, still runs the full pass between 03:00 and 03:04 UTC', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-02T03:02:00Z') });
    listGarminBlobs.mockResolvedValue([]);
    const response = await call('Bearer test-secret');

    expect(await response.json()).toEqual({ imports: 2, failed: 1, swept: 3 });
    expect(resumeImports).toHaveBeenCalledTimes(1);
    expect(sweepOldBlobs).toHaveBeenCalledWith(new Date('2026-11-02T03:02:00Z'), []);
  });

  it('runs the full pass when Blob cannot be listed, so an outage never stops an import', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    listGarminBlobs.mockRejectedValue(new Error('blob down'));
    const response = await call('Bearer test-secret');

    expect(await response.json()).toEqual({ imports: 2, failed: 1, swept: 3 });
    expect(resumeImports).toHaveBeenCalledTimes(1);
    expect(sweepOldBlobs.mock.calls[0][1]).toBeUndefined();
    errors.mockRestore();
  });

  it('answers a chained run at once and runs it after, taking an import without the minute’s wait (garmin-integration/08)', async () => {
    const response = await call('Bearer test-secret', '?chained=1');

    expect(response.status).toBe(202);
    expect(resumeImports).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);

    await after.mock.calls[0][0]();
    expect(resumeImports.mock.calls[0][4]).toBe(0);
    expect(sweepOldBlobs).toHaveBeenCalledTimes(1);
  });

  it('is never cached, and may run five minutes with the import budget inside it', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.maxDuration).toBe(300);
    expect(IMPORT_TIME_BUDGET_MS + IMPORT_BUDGET_MARGIN_MS).toBeLessThanOrEqual(route.maxDuration * 1000);
  });
});
