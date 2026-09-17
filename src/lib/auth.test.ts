import { describe, expect, it, vi } from 'vitest';

// auth.ts calls getDb() at module load to build its adapter; the neon-http
// driver opens no connection until a query runs, so a fake URL is enough here.
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost/test');

const { auth, resolveTrustedOrigins } = await import('./auth');

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

describe('trustedOrigins', () => {
  // Vercel serves one preview deployment on two hosts: its unique URL
  // (`VERCEL_URL`, what `baseURL` is built from) and the git-branch alias
  // (`VERCEL_BRANCH_URL`, what the PR comment links to). Only the first was
  // trusted, so sign-in on the linked preview failed with "Invalid origin"
  // (found testing PR #77). Both hosts are the same deployment; trust both.
  it('trusts the git-branch alias of a preview as well as its unique URL', () => {
    expect(
      resolveTrustedOrigins({
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'app-abc123-team.vercel.app',
        VERCEL_BRANCH_URL: 'app-git-my-branch-team.vercel.app',
      }),
    ).toEqual(['https://app-abc123-team.vercel.app', 'https://app-git-my-branch-team.vercel.app']);
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
  });

  it('trusts BETTER_AUTH_URL alone locally, and nothing when nothing is set', () => {
    expect(resolveTrustedOrigins({ BETTER_AUTH_URL: 'http://localhost:3001' })).toEqual([
      'http://localhost:3001',
    ]);
    expect(resolveTrustedOrigins({})).toEqual([]);
  });
});
