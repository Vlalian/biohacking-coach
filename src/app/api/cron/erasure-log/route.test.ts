import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import vercelJson from '../../../../../vercel.json';

/**
 * `garmin-connect-api/09` — the daily job that deletes erasure records past
 * their three years. The repository is mocked; the secret is a stub, never a
 * real one.
 */
const { deleteErasureLogsBefore } = vi.hoisted(() => ({ deleteErasureLogsBefore: vi.fn() }));
vi.mock('@/features/erasure/erasure-repository', () => ({ deleteErasureLogsBefore }));

const route = await import('./route');

const call = (authorization?: string) =>
  route.GET(new Request('http://localhost/api/cron/erasure-log', { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET', 'test-secret');
  deleteErasureLogsBefore.mockResolvedValue(0);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('GET /api/cron/erasure-log', () => {
  it('answers 401 without the cron secret and deletes nothing', async () => {
    for (const header of [undefined, 'Bearer wrong']) {
      const response = await call(header);
      expect(response.status).toBe(401);
      expect(await response.text()).toBe('Unauthorized');
    }
    expect(deleteErasureLogsBefore).not.toHaveBeenCalled();
  });

  it('deletes every record erased before the three-year cutoff and says how many', async () => {
    vi.useFakeTimers({ now: new Date('2029-11-02T03:17:00Z') });
    deleteErasureLogsBefore.mockResolvedValue(4);

    const response = await call('Bearer test-secret');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 4 });
    expect(deleteErasureLogsBefore).toHaveBeenCalledWith(new Date('2026-11-02T03:17:00Z'));
  });

  it('is never cached, and runs once a day', () => {
    expect(route.dynamic).toBe('force-dynamic');
    const cron = vercelJson.crons.find((c) => c.path === '/api/cron/erasure-log');
    expect(cron?.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
  });
});
