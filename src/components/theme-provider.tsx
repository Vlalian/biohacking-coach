'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * The `'use client'` boundary for next-themes, so the server-rendered locale
 * layout can mount the provider without itself becoming a client component. The
 * strategy itself — `system` default, `enableSystem`, class attribute — is
 * configured at the point of use in the layout, not here; this file only draws
 * the boundary. `system` + `enableSystem` is what preserves the OS-follows-you
 * behavior the app had before shadcn swapped the CSS `prefers-color-scheme`
 * block for a `.dark` class.
 */
export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
