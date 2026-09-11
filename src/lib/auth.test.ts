import { describe, expect, it, vi } from 'vitest';

// auth.ts calls getDb() at module load to build its adapter; the neon-http
// driver opens no connection until a query runs, so a fake URL is enough here.
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost/test');

const { auth } = await import('./auth');

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
