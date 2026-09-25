import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `garmin-integration/04` — the cron that carries imports past the first
 * minute and sweeps what Blob still holds after a day. Blob and the worker are
 * mocked; the secret is a stub, never a real one.
 */
const { resumeImports, sweepOldBlobs, blobWorkerDeps } = vi.hoisted(() => ({
  resumeImports: vi.fn(),
  sweepOldBlobs: vi.fn(),
  blobWorkerDeps: { fetchBlob: vi.fn(), deleteBlob: vi.fn(), today: () => '2026-09-25' },
}));
vi.mock('@/features/garmin/history-import-worker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/garmin/history-import-worker')>()),
  resumeImports,
}));
vi.mock('@/features/garmin/blob-store', () => ({ sweepOldBlobs, blobWorkerDeps }));

const route = await import('./route');

const call = (authorization?: string) =>
  route.GET(new Request('http://localhost/api/cron/garmin-import', { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET', 'test-secret');
  resumeImports.mockResolvedValue({ resumed: 2, failed: 1 });
  sweepOldBlobs.mockResolvedValue(3);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('GET /api/cron/garmin-import', () => {
  it('answers 401 without the bearer secret and runs nothing', async () => {
    for (const header of [undefined, 'Bearer wrong', 'test-secret']) {
      const response = await call(header);
      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Unauthorized');
    }
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
    expect(resumeImports).not.toHaveBeenCalled();
    expect(sweepOldBlobs).not.toHaveBeenCalled();
  });

  it('runs importing rows, fails the stalled ones, and sweeps blobs older than 24 h', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-25T12:00:00Z') });
    const response = await call('Bearer test-secret');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imports: 2, failed: 1, swept: 3 });
    const [deps, now, timeUp, stallAfterMs] = resumeImports.mock.calls[0];
    expect(stallAfterMs).toBe(30 * 60 * 1000);
    expect(deps).toBe(blobWorkerDeps);
    expect(now).toEqual(new Date('2026-09-25T12:00:00Z'));
    expect(timeUp()).toBe(false);
    vi.advanceTimersByTime(50_000);
    expect(timeUp()).toBe(true);
    expect(sweepOldBlobs).toHaveBeenCalledWith(new Date('2026-09-25T12:00:00Z'));
  });

  it('is never cached, and may run a minute', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.maxDuration).toBe(60);
  });
});
