import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `garmin-integration/08` — the chained run's request. `fetch` is the boundary
 * and is stubbed; the secrets are stubs, never real ones.
 */
const { requestNextImportRun } = await import('./import-chain');

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.stubEnv('BETTER_AUTH_URL', '');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'app.example.com');
  vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('requestNextImportRun', () => {
  it('calls the cron import route as a chained run, with the cron secret', async () => {
    await requestNextImportRun();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://app.example.com/api/cron/garmin-import?chained=1');
    expect(init.headers).toEqual({ authorization: 'Bearer test-secret' });
  });

  it('calls the preview’s own deployment, with the protection bypass when the project has one', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'bc-abc123.vercel.app');
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'bypass');
    await requestNextImportRun();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://bc-abc123.vercel.app/api/cron/garmin-import?chained=1');
    expect(init.headers).toEqual({ authorization: 'Bearer test-secret', 'x-vercel-protection-bypass': 'bypass' });
  });

  it('asks nothing when CRON_SECRET is not set', async () => {
    vi.stubEnv('CRON_SECRET', '');
    await requestNextImportRun();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks nothing when there is no origin to call', async () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    await requestNextImportRun();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws: a refused or failed request is logged without its URL, and the cron carries on', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(requestNextImportRun()).resolves.toBeUndefined();
    expect(errors).toHaveBeenLastCalledWith('history import chain refused', 401);

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(requestNextImportRun()).resolves.toBeUndefined();
    expect(errors).toHaveBeenLastCalledWith('history import chain failed');
    errors.mockRestore();
  });
});
