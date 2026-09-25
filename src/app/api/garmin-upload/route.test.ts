import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `garmin-integration/04` — the token route. `handleUpload` is mocked: it is
 * Blob's code, and what matters here is what this route answers when Blob asks
 * whether to issue a token. The actor comes from the session, never the body.
 */
const { handleUpload, resolveAthlete } = vi.hoisted(() => ({ handleUpload: vi.fn(), resolveAthlete: vi.fn() }));
vi.mock('@vercel/blob/client', () => ({ handleUpload }));
vi.mock('../../[locale]/current-actor', () => ({ resolveAthlete }));

const route = await import('./route');

type TokenOptions = { allowedContentTypes: string[]; maximumSizeInBytes: number; addRandomSuffix: boolean; validUntil: number };
type Hook = (pathname: string, clientPayload: string | null, multipart: boolean) => Promise<TokenOptions>;

/** Posts a token request; `handleUpload` runs the route's hook the way Blob does. */
async function ask(pathname: string, clientPayload: unknown) {
  let issued: TokenOptions | undefined;
  handleUpload.mockImplementation(async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: Hook }) => {
    issued = await onBeforeGenerateToken(pathname, clientPayload === null ? null : JSON.stringify(clientPayload), false);
    return { type: 'blob.generate-client-token', clientToken: 'tok' };
  });
  const body = { type: 'blob.generate-client-token', payload: { pathname, clientPayload, multipart: false } };
  const response = await route.POST(new Request('http://localhost/api/garmin-upload', { method: 'POST', body: JSON.stringify(body) }));
  return { response, issued };
}

const OPEN = { id: 'a1', profile: null };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/garmin-upload', () => {
  it('generates a token only through uploadPolicy, with the actor from the session', async () => {
    resolveAthlete.mockResolvedValue(OPEN);
    vi.useFakeTimers({ now: new Date('2026-09-25T12:00:00Z') });
    const { response, issued } = await ask('garmin/history/a1/export.zip', { kind: 'history', athleteId: 'a2' });
    vi.useRealTimers();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 'blob.generate-client-token', clientToken: 'tok' });
    expect(issued).toEqual({
      allowedContentTypes: ['application/octet-stream', 'application/zip', 'application/gpx+xml', 'application/xml'],
      maximumSizeInBytes: 500 * 1024 * 1024,
      addRandomSuffix: true,
      validUntil: new Date('2026-09-25T13:00:00Z').getTime(),
    });
    expect(handleUpload).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ type: 'blob.generate-client-token' }), request: expect.any(Request) }),
    );
    expect(handleUpload.mock.calls[0][0].onUploadCompleted).toBeUndefined();
  });

  it('ignores an athlete id in the payload: a path under another athlete is refused', async () => {
    resolveAthlete.mockResolvedValue(OPEN);
    const { response, issued } = await ask('garmin/history/a2/export.zip', { kind: 'history', athleteId: 'a2' });
    expect(response.status).toBe(403);
    expect(issued).toBeUndefined();
  });

  it('refuses a signed-out request with 401', async () => {
    resolveAthlete.mockResolvedValue(null);
    const { response } = await ask('garmin/history/a1/export.zip', { kind: 'history' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'not-authenticated' });
  });

  it('refuses a history upload once the lock is taken, but not a detection upload', async () => {
    resolveAthlete.mockResolvedValue({ id: 'a1', profile: { historyImportedAt: '2026-09-20T10:00:00.000Z' } });
    expect((await ask('garmin/history/a1/export.zip', { kind: 'history' })).response.status).toBe(403);
    expect((await ask('garmin/detection/a1/ride.fit', { kind: 'detection' })).response.status).toBe(200);
  });

  it('refuses another file type, and a payload with no kind it knows', async () => {
    resolveAthlete.mockResolvedValue(OPEN);
    expect((await ask('garmin/history/a1/notes.txt', { kind: 'history' })).response.status).toBe(403);
    const unknown = await ask('garmin/history/a1/export.zip', { kind: 'photos' });
    expect(unknown.response.status).toBe(403);
    expect(await unknown.response.json()).toEqual({ error: 'bad-kind' });
    expect((await ask('garmin/history/a1/export.zip', null)).response.status).toBe(403);
  });

  it('answers 400 when Blob itself cannot handle the request', async () => {
    handleUpload.mockRejectedValue(new Error('bad signature'));
    const response = await route.POST(new Request('http://localhost/api/garmin-upload', { method: 'POST', body: '{}' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad-request' });
  });

  it('answers 400 to a body that is not JSON, before Blob is asked', async () => {
    const response = await route.POST(new Request('http://localhost/api/garmin-upload', { method: 'POST', body: 'nope' }));
    expect(response.status).toBe(400);
    expect(handleUpload).not.toHaveBeenCalled();
  });

  it('is never cached', () => {
    expect(route.dynamic).toBe('force-dynamic');
  });
});
