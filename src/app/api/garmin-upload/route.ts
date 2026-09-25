import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import {
  acceptsPathname,
  TOKEN_VALID_MS,
  uploadKindOf,
  uploadPolicy,
  uploadState,
  type UploadRefusal,
} from '@/features/garmin/blob-upload';
import { resolveAthlete } from '../../[locale]/current-actor';

/**
 * The token route for both Garmin uploads (`garmin-integration/04`).
 *
 * The browser's `upload()` asks here for a short-lived token, then sends the
 * file straight to Vercel Blob — a function body is capped at 4.5 MB, a Garmin
 * export is hundreds of MB. Before a token is issued: someone is signed in and
 * is an athlete, a history upload finds the lock untaken, the file is a `.fit`,
 * `.gpx` or `.zip` named directly under that athlete's own prefix, and the
 * token caps it at 500 MB. The athlete comes from the session; the client's
 * payload is read for `kind` and nothing else (ADR 0006).
 *
 * The consent checked is the one today's upload checked: none beyond being
 * signed in. `onUploadCompleted` is left out on purpose — Blob's callback does
 * not reach localhost or a protected preview, so the client reports the
 * finished upload through the server actions instead.
 */

// Depends on who is signed in, so it can never be prerendered or cached.
export const dynamic = 'force-dynamic';

/** A token refused for a reason the athlete's side can be told. */
class UploadRefused extends Error {
  constructor(readonly reason: UploadRefusal | 'bad-path') {
    super(reason);
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: 'bad-request' }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const kind = uploadKindOf(clientPayload);
        if (kind === null) throw new UploadRefused('bad-kind');
        const policy = uploadPolicy(kind, uploadState(await resolveAthlete()));
        if (!policy.ok) throw new UploadRefused(policy.reason);
        if (!acceptsPathname(policy.pathPrefix, pathname)) throw new UploadRefused('bad-path');
        return {
          allowedContentTypes: policy.allowedContentTypes,
          maximumSizeInBytes: policy.maximumSizeInBytes,
          addRandomSuffix: true,
          validUntil: Date.now() + TOKEN_VALID_MS,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    if (!(error instanceof UploadRefused)) return Response.json({ error: 'bad-request' }, { status: 400 });
    return Response.json({ error: error.reason }, { status: error.reason === 'not-authenticated' ? 401 : 403 });
  }
}
