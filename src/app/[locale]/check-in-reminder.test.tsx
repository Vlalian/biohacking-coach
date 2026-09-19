import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * The Check-in reminder (`training-architecture/21`): the banner that asks,
 * and the Check-in step it opens — the same three-score form the Weekly
 * Session opened with, lifted into its own component. Static render, both
 * states; the host decides which.
 */
vi.mock('next-intl', () => ({ useTranslations: (ns: string) => (key: string) => `${ns}.${key}()` }));

const { CheckInReminder } = await import('./check-in-reminder');
const { CheckInStep } = await import('./check-in-step');

const handlers = { onOpen: vi.fn(), onSkip: vi.fn(), onSubmit: vi.fn() };

describe('CheckInReminder', () => {
  it('closed: asks, with "check in" and "not now" — and no form yet', () => {
    const html = renderToStaticMarkup(
      <CheckInReminder open={false} pending={false} failed={false} {...handlers} />,
    );
    expect(html).toContain('CoachThread.offerBody()');
    expect(html).toContain('data-action="open-check-in"');
    expect(html).toContain('CoachThread.offerAccept()');
    expect(html).toContain('data-action="dismiss-check-in"');
    expect(html).not.toContain('data-check-in-step');
  });

  it('open: renders the Check-in step in place of the banner', () => {
    const html = renderToStaticMarkup(
      <CheckInReminder open pending={false} failed={false} {...handlers} />,
    );
    expect(html).toContain('data-check-in-step');
    expect(html).not.toContain('data-action="open-check-in"');
    expect(html).not.toContain('role="alert"');
  });

  it('open and failed: keeps the form and says so, so the answers are not lost', () => {
    const html = renderToStaticMarkup(
      <CheckInReminder open pending={false} failed {...handlers} />,
    );
    expect(html).toContain('data-check-in-step');
    expect(html).toContain('role="alert"');
    expect(html).toContain('CoachThread.checkInError()');
  });
});

describe('CheckInStep', () => {
  const html = renderToStaticMarkup(
    <CheckInStep pending={false} onSubmit={handlers.onSubmit} onSkip={handlers.onSkip} />,
  );

  it('asks the three scores as 1–10 rows, and the sentence with its own warning', () => {
    for (const row of ['energy', 'body', 'sleep']) {
      expect(html).toContain(`aria-label="CheckIn.${row}()"`);
    }
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(30);
    expect(html).toContain('CheckIn.signal()');
    expect(html).toContain('CheckIn.signalHint()');
    expect(html).toContain('maxLength="500"');
  });

  it('cannot be submitted half-filled: Continue starts disabled, Skip does not', () => {
    // Half a Check-in renders to the Coach as none at all, so the button waits
    // for all three scores rather than filing what it has.
    expect(html).toMatch(/<button type="submit" disabled=""/);
    expect(html).toMatch(/<button type="button"[^>]*>CheckIn\.skip\(\)<\/button>/);
    expect(html).not.toMatch(/<button type="button" disabled=""[^>]*>CheckIn\.skip\(\)/);
  });
});
