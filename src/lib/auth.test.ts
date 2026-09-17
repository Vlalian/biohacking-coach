import { describe, expect, it, vi } from 'vitest';

// auth.ts calls getDb() at module load to build its adapter; the neon-http
// driver opens no connection until a query runs, so a fake URL is enough here.
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost/test');

const { auth, resolveBaseURL, resolveTrustedOrigins } = await import('./auth');

describe('auth plugins', () => {
  const pluginIds = (auth.options.plugins ?? []).map((p) => p.id);

  it('registers the admin plugin, so the operator can impersonate and manage users', () => {
    expect(pluginIds).toContain('admin');
  });

  it("keeps nextCookies last, as better-auth's Next.js guide requires", () => {
    expect(pluginIds.at(-1)).toBe('next-cookies');
  });

  it('exposes the impersonation audit column on the session type', () => {
    // A compile-time check as much as a runtime one: `impersonatedBy` is the
    // trail an impersonated session leaves, and the type must carry it.
    type SessionRow = typeof auth.$Infer.Session.session;
    const key: keyof SessionRow = 'impersonatedBy';
    expect(key).toBe('impersonatedBy');
  });
});

// The origin rules for the three places this runs — local, a Vercel preview,
// production. Why the alias is trusted is on `resolveTrustedOrigins`.
describe('baseURL and trustedOrigins', () => {
  it('trusts the git-branch alias of a preview as well as its unique URL', () => {
    expect(
      resolveTrustedOrigins({
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'app-abc123-team.vercel.app',
        VERCEL_BRANCH_URL: 'app-git-my-branch-team.vercel.app',
      }),
    ).toEqual(['https://app-abc123-team.vercel.app', 'https://app-git-my-branch-team.vercel.app']);
  });

  // Ticket 31's ruling: the alias is trusted, but cookies and callbacks are
  // still signed against the unique host.
  it('keeps baseURL on the unique host even when the alias is trusted', () => {
    expect(
      resolveBaseURL({
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'app-abc123-team.vercel.app',
        VERCEL_BRANCH_URL: 'app-git-my-branch-team.vercel.app',
      }),
    ).toBe('https://app-abc123-team.vercel.app');
  });

  it('does not trust a branch alias outside a preview — `vercel dev` or a pulled .env.local', () => {
    expect(
      resolveTrustedOrigins({
        VERCEL_ENV: 'development',
        VERCEL_URL: 'localhost:3000',
        VERCEL_BRANCH_URL: 'app-git-my-branch-team.vercel.app',
      }),
    ).toEqual(['https://localhost:3000']);
  });

  it('trusts the unique host only when a preview has no branch alias', () => {
    expect(
      resolveTrustedOrigins({ VERCEL_ENV: 'preview', VERCEL_URL: 'app-abc123-team.vercel.app' }),
    ).toEqual(['https://app-abc123-team.vercel.app']);
  });

  it('lists a host once when the alias and the unique URL coincide', () => {
    expect(
      resolveTrustedOrigins({
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'app-same-team.vercel.app',
        VERCEL_BRANCH_URL: 'app-same-team.vercel.app',
      }),
    ).toEqual(['https://app-same-team.vercel.app']);
  });

  it('trusts only the production URL in production — the branch alias is not it', () => {
    expect(
      resolveTrustedOrigins({
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'app.example.com',
        VERCEL_URL: 'app-abc123-team.vercel.app',
        VERCEL_BRANCH_URL: 'app-git-main-team.vercel.app',
      }),
    ).toEqual(['https://app.example.com']);
    expect(
      resolveBaseURL({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'app.example.com' }),
    ).toBe('https://app.example.com');
  });

  it('trusts BETTER_AUTH_URL alone locally, and nothing when nothing is set', () => {
    expect(resolveTrustedOrigins({ BETTER_AUTH_URL: 'http://localhost:3001' })).toEqual([
      'http://localhost:3001',
    ]);
    expect(resolveBaseURL({ BETTER_AUTH_URL: 'http://localhost:3001' })).toBe(
      'http://localhost:3001',
    );
    expect(resolveTrustedOrigins({})).toEqual([]);
    expect(resolveBaseURL({})).toBeUndefined();
  });
});
