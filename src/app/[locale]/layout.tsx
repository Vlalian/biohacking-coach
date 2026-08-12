import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Inter, Barlow, Bebas_Neue, JetBrains_Mono } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from '@/components/theme-provider';
import '../globals.css';

// The Trackside brand fonts (ported from the Lovable design): Inter is the
// base body font, Barlow is the display-adjacent body face, Bebas Neue is the
// display/headline face, JetBrains Mono is the label/mono face. Each exposes
// a CSS variable that globals.css's @theme inline block wires to font-sans /
// font-body / font-display / font-mono.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-barlow',
});
const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-bebas-neue',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

// The product name is a proper noun and stays English in every locale; the
// description is prose and resolves through i18n like every other string.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: 'Biohacking Coach',
    description: t('description'),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    // suppressHydrationWarning: next-themes sets the `class` and color-scheme on
    // <html> before React hydrates, so the server-rendered markup deliberately
    // differs from the first client paint. The warning is silenced for this one
    // node only — not its subtree.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${barlow.variable} ${bebasNeue.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
