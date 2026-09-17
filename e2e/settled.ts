import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A page is ready to photograph when its loading states have left and nothing
 * is still in flight. The skeletons all carry `animate-pulse` (the four
 * hand-rolled ones today, the Skeleton primitive after frontend-quality/02).
 */
export async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
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
