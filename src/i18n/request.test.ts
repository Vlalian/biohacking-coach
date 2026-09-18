import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({ getRequestConfig: (fn: unknown) => fn }));
vi.mock('next-intl', () => ({ hasLocale: (locales: readonly string[], l: string) => locales.includes(l) }));

const { default: config, APP_TIME_ZONE } = await import('./request');
type Config = (args: { requestLocale: Promise<string | undefined> }) => Promise<{ locale: string; timeZone?: string }>;
const resolve = config as unknown as Config;

describe('request config', () => {
  it('pins the app to Europe/Copenhagen for the test round (showable-version/25, Mads 2026-09-17) and keeps locale resolution', async () => {
    expect(APP_TIME_ZONE).toBe('Europe/Copenhagen');
    const resolved = await resolve({ requestLocale: Promise.resolve('da') });
    expect(resolved.timeZone).toBe('Europe/Copenhagen');
    expect(resolved.locale).toBe('da');
    expect((await resolve({ requestLocale: Promise.resolve('xx') })).locale).toBe('en');
  });
});
