import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import en from '@/messages/en.json';
import da from '@/messages/da.json';

/**
 * showable-version/62: the Frontpage a signed-out visitor meets at `/`. The
 * translator mock reads the real catalogues, so these tests see the copy a
 * visitor reads, in the locale the page was asked for.
 */
const catalogues = { en, da } as const;
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

/** Every frame without a picture yet, so each shows its placeholder. */
const empty = { src: '', alt: '' };
const placeholders = { rosterView: empty, coachChat: empty, trainingPlan: empty, informationView: empty };

function html(locale: 'en' | 'da', screenshots = placeholders) {
  current.locale = locale;
  return renderToStaticMarkup(<FrontpageView locale={locale} screenshots={screenshots} />);
}

const sources = () =>
  ['./frontpage-view.tsx', './screenshots.ts']
    .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
    .join('\n');

describe('FrontpageView copy', () => {
  it.each(['en', 'da'] as const)('renders every %s Frontpage string and none of the other language', (locale) => {
    const out = html(locale);
    const other = locale === 'en' ? 'da' : 'en';
    const plain = (value: string) => !/[{}&<>"'\n]/.test(value);
    for (const [key, value] of Object.entries(catalogues[locale].Frontpage as Record<string, string>)) {
      // The pictures' alt texts (showable-version/63) appear only once a picture
      // has a src; frontpage-pictures.test.tsx renders them.
      if (!plain(value) || key.startsWith('alt')) continue;
      expect(out, `${locale}.Frontpage.${key} is rendered`).toContain(value);
      const foreign = (catalogues[other].Frontpage as Record<string, string>)[key];
      if (foreign !== value && plain(foreign)) {
        expect(out, `${other}.Frontpage.${key} must not leak into ${locale}`).not.toContain(foreign);
      }
    }
  });
});

describe('FrontpageView heading with a line break', () => {
  // CodeRabbit on PR #133: the copy test skips strings with a newline, so whyTitle is checked here.
  it.each(['en', 'da'] as const)('renders the %s whyTitle, line break included', (locale) => {
    expect(html(locale)).toContain(catalogues[locale].Frontpage.whyTitle);
  });
});

describe('FrontpageView links', () => {
  it('links every Sign in action to /sign-in and the footer link to /privacy', () => {
    const enOut = html('en');
    expect(enOut.match(/href="\/sign-in"/g)).toHaveLength(3);
    expect(enOut).toMatch(/href="\/privacy"[^>]*>Privacy policy</);
    const daOut = html('da');
    expect(daOut.match(/href="\/sign-in"/g)).toHaveLength(3);
    expect(daOut).toMatch(/href="\/privacy"[^>]*>Privatlivspolitik</);
    expect(daOut).not.toContain('Privacy &amp; Terms');
  });
});

describe('FrontpageView language switch', () => {
  it('links to / in the other locale and marks the current one', () => {
    const enOut = html('en');
    expect(enOut.match(/data-locale="da"/g)).toHaveLength(2);
    expect(enOut).toMatch(/data-locale="en"[^>]*aria-current="true"/);
    expect(enOut).toMatch(/<a href="\/" data-locale="da"/);

    const daOut = html('da');
    expect(daOut.match(/data-locale="en"/g)).toHaveLength(2);
    expect(daOut).toMatch(/data-locale="da"[^>]*aria-current="true"/);
    expect(daOut).toMatch(/<a href="\/" data-locale="en"/);
  });
});

describe('FrontpageView View labels', () => {
  it('uses the Shell labels, so Danish reads Træningsplan', () => {
    const daOut = html('da');
    expect(daOut).toContain(da.Shell.viewTrainingPlan);
    expect(daOut).toContain(da.Shell.viewRoster);
    expect(daOut).not.toContain('Training Plan');
    expect(daOut).not.toContain('Roster');

    const enOut = html('en');
    expect(enOut).toContain('Training Plan');
    expect(enOut).toContain('the Roster View');
    expect(enOut).toContain('the Information View');
  });
});

describe('FrontpageView screenshots', () => {
  const placeholderCount = (out: string, text: string) => out.split(text).length - 1;

  it('shows the placeholder in all four frames while every src is empty', () => {
    expect(placeholderCount(html('en'), 'Demo screenshot to follow')).toBe(4);
    expect(placeholderCount(html('da'), 'Demo-skærmbillede følger')).toBe(4);
  });

  it('shows an image in place of the placeholder once a src is given, and labels the chat frame', () => {
    const withChat = {
      ...placeholders,
      coachChat: { src: '/shots/coach-chat.png', alt: 'The Momentum chat' },
    };
    const out = html('en', withChat);
    expect(out).toContain('alt="The Momentum chat"');
    expect(placeholderCount(out, 'Demo screenshot to follow')).toBe(3);
    expect(out).toContain('Ask Momentum');
    expect(html('da')).toContain('Spørg Momentum');
  });
});

describe('Frontpage and the retired Weekly Session', () => {
  it('has no weeklySession prop, key or string', () => {
    expect(Object.keys(frontpageScreenshotsFor((key) => key)).sort()).toEqual(
      ['coachChat', 'informationView', 'rosterView', 'trainingPlan'],
    );
    expect(sources()).not.toMatch(/weekly/i);
    for (const catalogue of [en, da]) {
      const text = JSON.stringify(catalogue.Frontpage);
      expect(text).not.toMatch(/weekly|ugentlig/i);
      expect(text).not.toMatch(/anonym/i);
    }
  });
});

describe('Frontpage assets and browser APIs', () => {
  const cyclist = 'momentum-signin-cyclist.jpg';
  const swimmer = 'momentum-endurance-open-water-woman.jpg';

  it('serves both photos from public/', () => {
    const out = html('en');
    expect(out).toContain(cyclist);
    expect(out).toContain(swimmer);
    for (const file of [cyclist, swimmer]) {
      expect(existsSync(fileURLToPath(new URL(`../../../public/${file}`, import.meta.url)))).toBe(true);
    }
  });

  it('does not use localStorage, sessionStorage, fetch or window.matchMedia', () => {
    expect(sources()).not.toMatch(/localStorage|sessionStorage|\bfetch\s*\(|matchMedia/);
  });
});
