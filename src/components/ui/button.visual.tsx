import { expect, test } from '@playwright/experimental-ct-react';
import { Button } from './button';

/**
 * Appearance contract for the Button primitive (frontend-quality/01). One
 * snapshot per variant and per size, in both themes, plus the two states a
 * refactor breaks most quietly: disabled and keyboard focus.
 *
 * Behaviour is not asserted here — there is none to assert on a button. What
 * is asserted is that a class dropped from `buttonVariants` changes pixels,
 * and that is only worth anything if the baselines are committed.
 */

const variants = [
  'default',
  'outline',
  'secondary',
  'ghost',
  'destructive',
  'link',
] as const;

const sizes = [
  'default',
  'xs',
  'sm',
  'lg',
  'icon',
  'icon-xs',
  'icon-sm',
  'icon-lg',
] as const;

const themes = ['light', 'dark'] as const;

/**
 * Icons are sized by the button; a plain glyph stands in for lucide here. Inline
 * JSX rather than a component: Playwright CT can only mount components it can
 * import, and one defined in the test file is not that.
 */
const glyph = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6" fill="currentColor" />
  </svg>
);

for (const theme of themes) {
  test.describe(theme, () => {
    for (const variant of variants) {
      test(`variant ${variant}`, async ({ mount }) => {
        const component = await mount(
          <div className={`${theme} inline-block bg-background p-4`}>
            <Button variant={variant}>Save week</Button>
          </div>,
        );
        await expect(component).toHaveScreenshot();
      });
    }

    for (const size of sizes) {
      test(`size ${size}`, async ({ mount }) => {
        const iconOnly = size.startsWith('icon');
        const component = await mount(
          <div className={`${theme} inline-block bg-background p-4`}>
            <Button size={size}>{iconOnly ? glyph : 'Save week'}</Button>
          </div>,
        );
        await expect(component).toHaveScreenshot();
      });
    }

    test('disabled', async ({ mount }) => {
      const component = await mount(
        <div className={`${theme} inline-block bg-background p-4`}>
          <Button disabled>Save week</Button>
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('focus-visible', async ({ mount, page }) => {
      const component = await mount(
        <div className={`${theme} inline-block bg-background p-4`}>
          <Button>Save week</Button>
        </div>,
      );
      await page.keyboard.press('Tab');
      await expect(component.getByRole('button')).toBeFocused();
      await expect(component).toHaveScreenshot();
    });
  });
}
