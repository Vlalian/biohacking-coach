'use client';

import { usePathname } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';

/**
 * The switcher between one athlete's three surfaces: Plan, Data, Briefing.
 *
 * These are links, not a Radix `Tabs` widget, because they are navigation
 * rather than panels of one page — each tab is its own route, so the browser's
 * back button, a reload, and a pasted URL all do what a coach expects. The
 * active one carries `aria-current="page"`, the correct semantic for "this is
 * where you are" in a nav (a tablist would claim `aria-selected`, which would
 * be a lie about markup that navigates).
 */
export function AthleteTabs({
  athleteId,
  labels,
}: {
  athleteId: string;
  labels: { plan: string; data: string; briefing: string };
}) {
  const pathname = usePathname();
  const base = `/coach/athlete/${athleteId}`;

  const tabs = [
    { href: `${base}/plan`, label: labels.plan },
    { href: `${base}/information`, label: labels.data },
    { href: `${base}/briefing`, label: labels.briefing },
  ];

  return (
    <nav className="flex w-full justify-center gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'border-b-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors',
              active
                ? 'border-signal text-signal'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
