import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: Record<string, unknown> = {}) =>
    `${key}(${Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')})`,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { WeeklySessionDayLine } = await import('./weekly-session-day-line');

describe('WeeklySessionDayLine — the athlete’s one line about their cycle (training-architecture/28)', () => {
  it('says which evening the draft is written and which day it is shown, and links to Settings', () => {
    const html = renderToStaticMarkup(<WeeklySessionDayLine weeklySessionDay="Wednesday" />);
    expect(html).toContain('text(coachDay=dayTuesday(),day=dayWednesday())');
    expect(html).toContain('href="/settings"');
    expect(html).toContain('change()');
  });

  it('with no stored day reads Sunday, written on Saturday', () => {
    expect(renderToStaticMarkup(<WeeklySessionDayLine weeklySessionDay={null} />)).toContain('text(coachDay=daySaturday(),day=daySunday())');
  });
});
