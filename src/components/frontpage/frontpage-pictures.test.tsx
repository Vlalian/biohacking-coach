import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import en from '@/messages/en.json';
import da from '@/messages/da.json';

/**
 * showable-version/63: with the four real pictures, the Frontpage shows them
 * with the reader's alt text and no placeholder. The mocks are the view test's.
 */
const current = vi.hoisted(() => ({ locale: 'en' as 'en' | 'da' }));

vi.mock('next-intl', async () => {
  const [{ default: enMsgs }, { default: daMsgs }] = await Promise.all([
    import('@/messages/en.json'),
    import('@/messages/da.json'),
  ]);
  return {
    useTranslations: (namespace: string) => (key: string, values: Record<string, string> = {}) => {
      const all = (current.locale === 'en' ? enMsgs : daMsgs) as unknown as Record<string, Record<string, string>>;
      return all[namespace][key].replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? `{${name}}`);
    },
  };
});
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, locale, children, ...rest }: { href: string; locale?: string; children: React.ReactNode }) => (
    <a href={href} data-locale={locale} {...rest}>{children}</a>
  ),
}));

const { FrontpageView } = await import('./frontpage-view');
const { frontpageScreenshotsFor } = await import('./screenshots');

const altKeys = ['altRosterView', 'altCoachChat', 'altTrainingPlan', 'altInformationView'] as const;

describe('FrontpageView with the real pictures', () => {
  it.each(['en', 'da'] as const)('renders four images with %s alt text and no placeholder', (locale) => {
    const cat = (locale === 'en' ? en : da).Frontpage as Record<string, string>;
    const shots = frontpageScreenshotsFor((key) => cat[key]);
    current.locale = locale;
    const out = renderToStaticMarkup(<FrontpageView locale={locale} screenshots={shots} />);
    for (const key of altKeys) {
      expect(out).toContain(`alt="${cat[key]}"`);
    }
    expect(out).not.toContain(cat.placeholder);
  });
});
