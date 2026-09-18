import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A page is ready to photograph when its loading states have left and nothing
 * is still in flight. Everything transient pulses: the Thinking dots while a
 * reply is pending, a Skeleton while data loads, the calendar's refused-drop
 * bounce. `animate-pulse` is the one class they share.
 */
export async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  // A cold dev server can answer a dynamic route's first request with the
  // not-found page while Turbopack is still compiling it (seen on
  // /coach/athlete/[id]/* at 98a851a). Its <h1> is the tell; a second visit
  // gets the compiled route. A genuine 404 shows up again and fails below.
  if (await page.locator('main h1', { hasText: /doesn't exist|findes ikke/i }).count()) {
    await page.reload({ waitUntil: 'networkidle' });
  }
  await page.locator('.animate-pulse').first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => undefined);
  // Fonts arrive after first paint; a snapshot taken before them is a different picture.
  await page.evaluate(() => document.fonts.ready);
  // The Next.js dev indicator is not the product; it changes with the dev
  // server's mood (compiling, errors) and would fail every baseline.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
}

/**
 * The whole page, top to bottom. The app shell is a fixed-height frame whose
 * `<main>` scrolls (`app-shell.tsx`), so Playwright's `fullPage` sees only the
 * frame; the viewport is grown to the content instead, then photographed.
 */
export async function snapshot(page: Page, mask: Locator[] = []): Promise<void> {
  const height = await page.evaluate(() => {
    const main = document.querySelector('main');
    const scroller = main ?? document.documentElement;
    return scroller.getBoundingClientRect().top + scroller.scrollHeight;
  });
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, Math.ceil(height)) });
  await expect(page).toHaveScreenshot({ fullPage: true, mask });
}

/**
 * The app shell's header bar, which names who is signed in. Pages carry their
 * own `<header>` too (the calendar's title row), so "first" is the shell's.
 */
export function shellHeader(page: Page): Locator {
  return page.locator('header').first();
}
