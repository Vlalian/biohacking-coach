/**
 * A pass-through root layout.
 *
 * Deliberately renders no `<html>` or `<body>`: with next-intl's `[locale]`
 * segment, `src/app/[locale]/layout.tsx` owns the document shell for every real
 * route (fonts, `lang={locale}`, ThemeProvider, NextIntlClientProvider), and
 * `src/app/not-found.tsx` owns it for a path that never reached a locale at all.
 * Emitting a shell here too would nest `<html>` inside `<html>`.
 *
 * It exists only so the root `not-found` has a layout above it, which is the
 * convention Next.js expects — the file is structural, not visual.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
