'use client';

import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LogOut, MessageSquareWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { AppShell, type AppShellStrings, type ThemePreference, type ViewId } from './app-shell';
import { CoachOverlayContext, type CoachReference } from './coach-overlay-context';

/** The escape hatch reads as an equal of Sign out — same weight, same footer. */
const ESCAPE_HATCH_CLASS =
  'flex w-full items-center gap-3 px-0 py-0 text-left font-body text-sm tracking-wide text-muted-foreground no-underline transition-colors hover:text-signal';

const SIGN_OUT_BUTTON_CLASS =
  'flex w-full items-center gap-3 px-0 py-0 text-left font-body text-sm tracking-wide text-muted-foreground no-underline transition-colors hover:text-signal disabled:opacity-50';

/**
 * "Has this component hydrated yet?", asked without a state update inside an
 * effect — which would schedule a second render pass on every mount. The store
 * never emits, so the only transition is the one React itself performs when it
 * stops using the server snapshot and starts using the client one.
 */
const NEVER_CHANGES = () => () => {};
const ON_CLIENT = () => true;
const ON_SERVER = () => false;

const VIEW_PATH: Record<ViewId, string> = {
  'training-plan': '/training-plan',
  information: '/information',
  equipment: '/equipment',
  glossary: '/glossary',
  messaging: '/messaging',
  settings: '/settings',
  privacy: '/privacy',
  roster: '/coach',
  feedback: '/feedback',
};

/**
 * The persistent app frame (ADR 0007's Coach Overlay + Navigation Drawer).
 * Owns local UI state only — which drawer is open, the theme cycle, and the
 * current View (derived from the route, since Views are real Next.js pages).
 * Durable data (athlete name, Coach Overlay content) arrives via props from
 * the server layout that renders this.
 */
export function ShellChrome({
  athleteName,
  availableViews,
  isCoachedMode = false,
  coachContent,
  children,
}: {
  athleteName?: string;
  availableViews: ViewId[];
  isCoachedMode?: boolean;
  coachContent?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('Shell');
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  /**
   * The stored theme preference exists only in the browser, so the server has
   * no way to know it. Rendering it straight away made the server say
   * "Automatisk" and the client say "Lyst" for the same button, which React
   * resolves by throwing the whole shell away and re-rendering it — a hydration
   * error on every page load.
   *
   * So the first client render deliberately agrees with the server (`system`,
   * the same default the provider is configured with) and the real preference
   * arrives one effect later. The cost is that the theme icon can change once,
   * just after mount; the alternative was discarding and rebuilding the entire
   * tree on every navigation.
   */
  const themeReady = useSyncExternalStore(NEVER_CHANGES, ON_CLIENT, ON_SERVER);
  const themePreference: ThemePreference = themeReady
    ? ((theme as ThemePreference) ?? 'system')
    : 'system';

  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  // The domain object the athlete opened the Coach with — set by "Discuss with
  // Coach" on a Session Drawer, cleared once the Coach has answered about it.
  const [reference, setReference] = useState<CoachReference | null>(null);
  // Held here rather than in the overlay: the overlay unmounts when closed, so
  // owning this below would re-offer the Weekly Session on every reopen.
  const [weeklyOfferDismissed, setWeeklyOfferDismissed] = useState(false);

  const strings: AppShellStrings = useMemo(
    () => ({
      // A proper noun, not prose — stays English in every locale (matches the
      // page <title> in layout.tsx), so it is not routed through next-intl.
      appName: 'Biohacking Coach',
      openNav: t('openNav'),
      closeNav: t('closeNav'),
      navLandmark: t('navLandmark'),
      themeLight: t('themeLight'),
      themeDark: t('themeDark'),
      themeSystem: t('themeSystem'),
      coachedModeBadge: t('coachedModeBadge'),
      openCoach: t('openCoach'),
      closeCoach: t('closeCoach'),
      coachOverlayTitle: t('coachOverlayTitle'),
      moveCoachOverlay: t('moveCoachOverlay'),
      views: {
        'training-plan': t('viewTrainingPlan'),
        information: t('viewInformation'),
        equipment: t('viewEquipment'),
        glossary: t('viewGlossary'),
        messaging: t('viewMessaging'),
        settings: t('viewSettings'),
        privacy: t('viewPrivacy'),
        roster: t('viewRoster'),
        feedback: t('viewFeedback'),
      },
    }),
    [t],
  );

  const currentView =
    (availableViews.find((v) => pathname.startsWith(VIEW_PATH[v])) ?? availableViews[0]) as ViewId;

  return (
    <CoachOverlayContext.Provider
      value={{
        open: coachOpen,
        setOpen: setCoachOpen,
        reference,
        setReference,
        weeklyOfferDismissed,
        dismissWeeklyOffer: () => setWeeklyOfferDismissed(true),
      }}
    >
      <AppShell
        currentView={currentView}
        availableViews={availableViews}
        isCoachedMode={isCoachedMode}
        athleteName={athleteName}
        theme={themePreference}
        navDrawerOpen={navDrawerOpen}
        coachOverlay={{ open: coachOpen }}
        coachContent={coachContent}
        navFooter={
          // The escape hatch (`showable-version/05` item 4, opening the
          // Feedback Interview per `07`). It sits in the drawer footer because
          // that footer is part of the shared shell, so this one placement makes
          // it reachable from *every* View — the athlete's five and the Head
          // Coach's Roster, which the same shell has wrapped since PR #41.
          <div className="flex flex-col gap-3">
            <Link
              href={VIEW_PATH.feedback}
              className={ESCAPE_HATCH_CLASS}
              onClick={() => setNavDrawerOpen(false)}
            >
              <MessageSquareWarning className="h-4 w-4" />
              {t('feedbackHatch')}
            </Link>
            <SignOutButton
              className={SIGN_OUT_BUTTON_CLASS}
              icon={<LogOut className="h-4 w-4" />}
            />
          </div>
        }
        onNavigate={(view) => router.push(VIEW_PATH[view])}
        onToggleNavDrawer={() => setNavDrawerOpen((v) => !v)}
        onToggleCoachOverlay={() => setCoachOpen((v) => !v)}
        onCycleTheme={() =>
          setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
        }
        t={strings}
      >
        {children}
      </AppShell>
    </CoachOverlayContext.Provider>
  );
}
