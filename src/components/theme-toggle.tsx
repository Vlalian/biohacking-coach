'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

// A no-op store whose client snapshot (`true`) differs from its server snapshot
// (`false`): it reads false during SSR and the first client render, then true
// after hydration. That is a hydration-safe "mounted" flag with no
// setState-in-effect — needed because the chosen theme is known only on the
// client, so the icon can't reflect it until after hydration.
const emptySubscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

// system → light → dark → system, so "auto" (follow the OS) stays reachable
// rather than being abandoned after the first click.
const ORDER = ['system', 'light', 'dark'] as const;

/**
 * Cycles the theme setting through system → light → dark and back. The icon
 * shows the current *setting* (Monitor for system, not the resolved colour), so
 * it reads the client-only `theme` behind a mounted guard; before hydration it
 * renders the system icon, which matches both the server and the default.
 */
export function ThemeToggle() {
  const t = useTranslations('ThemeToggle');
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const active = mounted ? (theme ?? 'system') : 'system';
  const index = (ORDER as readonly string[]).indexOf(active);
  const next = ORDER[(index + 1) % ORDER.length];

  const Icon = active === 'light' ? Sun : active === 'dark' ? Moon : Monitor;

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={t('switch')}
    >
      <Icon aria-hidden />
    </Button>
  );
}
