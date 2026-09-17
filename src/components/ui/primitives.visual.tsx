import { expect, test } from '@playwright/experimental-ct-react';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Button } from './button';
import { EmptyState } from './empty-state';
import { ErrorFallback } from './error-fallback';
import { Input } from './input';
import { Label } from './label';
import { Skeleton } from './skeleton';
import { Thinking } from './thinking';

/**
 * Appearance contract for the composite primitives (frontend-quality/02).
 * One snapshot per state per theme; behaviour lives in primitives.test.tsx.
 *
 * Every case is inline JSX rather than a helper component: Playwright CT can
 * only mount what it can import, and a component defined here is not that.
 */
const themes = ['light', 'dark'] as const;

const glyph = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6" fill="currentColor" />
  </svg>
);

for (const theme of themes) {
  test.describe(theme, () => {
    const frame = `${theme} inline-block w-[480px] bg-background p-4 text-foreground`;

    test('skeleton: session card', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('alert: default with title', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <Alert>
            {glyph}
            <AlertTitle>Week drafted</AlertTitle>
            <AlertDescription>The Coach proposed next week. Review it on Sunday.</AlertDescription>
          </Alert>
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('alert: default without title', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <Alert>
            <AlertDescription>Your Garmin file is queued.</AlertDescription>
          </Alert>
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('alert: destructive', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <Alert variant="destructive">
            {glyph}
            <AlertTitle>That move is refused</AlertTitle>
            <AlertDescription>A completed session cannot be moved into the past.</AlertDescription>
          </Alert>
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('input: empty', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="race">Race name</Label>
            <Input id="race" placeholder="Ironman Copenhagen" />
          </div>
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('input: filled', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="race">Race name</Label>
            <Input id="race" defaultValue="Ironman Copenhagen" />
          </div>
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('input: disabled', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <div className="group flex flex-col gap-2" data-disabled="true">
            <Label htmlFor="email">Email</Label>
            <Input id="email" defaultValue="sarah@example.com" disabled />
          </div>
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('input: invalid with message', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="hours">Weekly hours</Label>
            <Input id="hours" defaultValue="40" aria-invalid aria-describedby="hours-error" />
            <p id="hours-error" className="text-sm text-destructive">
              More than 25 hours a week is not a plan the Coach will write.
            </p>
          </div>
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('empty state: with action', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <EmptyState
            icon={glyph}
            title="No sessions yet"
            body="The Coach drafts your first week once you set a race."
            action={<Button size="sm">Set a race</Button>}
          />
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('empty state: without action', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <EmptyState title="No athletes" body="Nobody has accepted a Coaching Link yet." />
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('error fallback', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <ErrorFallback
            title="Something went wrong"
            body="The page could not load. Your data is safe."
            retryLabel="Try again"
            reset={() => undefined}
          />
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('thinking: signal', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <Thinking label="Coach is thinking" />
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });

    test('thinking: muted', async ({ mount }) => {
      const component = await mount(
        <div className={frame}>
          <Thinking label="Interviewer is thinking" tone="muted" />
        </div>,
      );
      await expect(component).toHaveScreenshot();
    });
  });
}
