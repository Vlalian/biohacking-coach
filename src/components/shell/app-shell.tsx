'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BookMarked,
  Bike,
  CalendarDays,
  BarChart3,
  GripHorizontal,
  MessageSquare,
  MessagesSquare,
  Moon,
  PanelLeft,
  ShieldCheck,
  Settings as SettingsIcon,
  Sun,
  SunMoon,
  Users,
  X,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Ported from the Lovable design (iron-insight-grid, shell brief).   */
/*  Presentational only — data in via props, writes out via callbacks. */
/*  Every visible string arrives via the required `t` prop; no baked-  */
/*  in English default (handoff-contract rule 2).                      */
/* ------------------------------------------------------------------ */

/** Note: there is no 'coach' View — the Coach is the always-available Overlay. */
export type ViewId =
  | 'training-plan'
  | 'information'
  | 'equipment'
  | 'glossary'
  | 'messaging'
  | 'settings'
  | 'privacy'
  | 'roster';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface AppShellStrings {
  appName: string;
  openNav: string;
  closeNav: string;
  navLandmark: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  coachedModeBadge: string;
  closeMessaging: string;
  openCoach: string;
  closeCoach: string;
  coachOverlayTitle: string;
  moveCoachOverlay: string;
  views: Record<ViewId, string>;
}

export interface AppShellProps {
  currentView: ViewId;
  availableViews: ViewId[];
  isCoachedMode: boolean;
  athleteName?: string;
  theme: ThemePreference;
  navDrawerOpen: boolean;
  /** The always-available Coach surface — not a View. */
  coachOverlay?: { open: boolean };
  messagingDrawer?: { open: boolean; title: string };
  navBadges?: Partial<Record<ViewId, number>>;
  /** Rendered at the bottom of the Navigation Drawer, below the View list —
   *  the shell's own account actions (sign out) live here, always reachable
   *  regardless of scroll position. Opaque content: this component stays
   *  presentational and does not know what it renders. */
  navFooter?: ReactNode;
  /** The active View renders here. */
  children: ReactNode;
  /** The Coach Overlay body — follows the athlete across Views. */
  coachContent?: ReactNode;
  /** The persistent Coaching Channel body (Coached Mode only). */
  messagingContent?: ReactNode;
  onNavigate: (view: ViewId) => void;
  onToggleNavDrawer: () => void;
  onToggleCoachOverlay?: () => void;
  onCycleTheme: () => void;
  onCloseMessagingDrawer?: () => void;
  t: AppShellStrings;
}

const VIEW_ICONS: Record<ViewId, typeof MessageSquare> = {
  'training-plan': CalendarDays,
  information: BarChart3,
  equipment: Bike,
  glossary: BookMarked,
  messaging: MessagesSquare,
  settings: SettingsIcon,
  privacy: ShieldCheck,
  roster: Users,
};

const THEME_ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: SunMoon,
};

/* ------------------------------------------------------------------ */
/*  Shell                                                              */
/* ------------------------------------------------------------------ */

export function AppShell({
  currentView,
  availableViews,
  isCoachedMode,
  athleteName,
  theme,
  navDrawerOpen,
  coachOverlay,
  messagingDrawer,
  navBadges,
  navFooter,
  children,
  coachContent,
  messagingContent,
  onNavigate,
  onToggleNavDrawer,
  onToggleCoachOverlay,
  onCycleTheme,
  onCloseMessagingDrawer,
  t,
}: AppShellProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const ThemeIcon = THEME_ICONS[theme];
  const themeLabel =
    theme === 'light' ? t.themeLight : theme === 'dark' ? t.themeDark : t.themeSystem;

  // Navigation Drawer dismisses on Escape as well as outside-tap.
  useEffect(() => {
    if (!navDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggleNavDrawer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navDrawerOpen, onToggleNavDrawer]);

  const go = (view: ViewId) => {
    onNavigate(view);
    if (navDrawerOpen) onToggleNavDrawer();
    // Pressing a nav entry returns focus to the content.
    requestAnimationFrame(() => contentRef.current?.focus());
  };

  const messagingOpen = Boolean(messagingDrawer?.open && isCoachedMode);
  const coachOpen = Boolean(coachOverlay?.open);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar — always holds the drawer trigger and the theme cycle */}
      <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3 sm:px-5">
        <button
          type="button"
          onClick={onToggleNavDrawer}
          aria-label={navDrawerOpen ? t.closeNav : t.openNav}
          aria-expanded={navDrawerOpen}
          className="inline-flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-signal hover:text-signal"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-display text-xl leading-none tracking-[0.08em] text-foreground">
            {t.appName}
          </span>
          <span className="hidden truncate font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            {t.views[currentView]}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Coach Overlay control — the Coach is not a nav entry */}
          <button
            type="button"
            onClick={onToggleCoachOverlay}
            aria-pressed={coachOpen}
            aria-label={coachOpen ? t.closeCoach : t.openCoach}
            title={coachOpen ? t.closeCoach : t.openCoach}
            className={[
              'inline-flex h-9 items-center gap-2 border px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors',
              coachOpen
                ? 'border-signal bg-signal text-signal-foreground'
                : 'border-border text-muted-foreground hover:border-signal hover:text-signal',
            ].join(' ')}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">{t.coachOverlayTitle}</span>
          </button>
          {isCoachedMode && (
            <span className="hidden border border-signal px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-signal sm:inline">
              {t.coachedModeBadge}
            </span>
          )}
          {athleteName && (
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground md:inline">
              {athleteName}
            </span>
          )}
          <button
            type="button"
            onClick={onCycleTheme}
            aria-label={themeLabel}
            title={themeLabel}
            className="inline-flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-signal hover:text-signal"
          >
            <ThemeIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Scrim — outside-tap dismiss for the Navigation Drawer */}
        {navDrawerOpen && (
          <button
            type="button"
            aria-label={t.closeNav}
            onClick={onToggleNavDrawer}
            className="absolute inset-0 z-30 bg-foreground/25 backdrop-blur-[1px]"
          />
        )}

        {/* Navigation Drawer — overlaps content (~20% desktop, full-width slide-over on phone) */}
        <nav
          aria-label={t.navLandmark}
          aria-hidden={!navDrawerOpen}
          className={[
            'absolute inset-y-0 left-0 z-40 flex w-[86%] max-w-[300px] flex-col border-r border-border bg-sidebar transition-transform duration-200 ease-out sm:w-[20%] sm:min-w-[220px]',
            navDrawerOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {t.navLandmark}
            </span>
            <button
              type="button"
              onClick={onToggleNavDrawer}
              aria-label={t.closeNav}
              className="text-muted-foreground transition-colors hover:text-signal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto py-2">
            {availableViews.map((view) => {
              const Icon = VIEW_ICONS[view];
              const active = view === currentView;
              const badge = navBadges?.[view];
              return (
                <li key={view}>
                  <button
                    type="button"
                    onClick={() => go(view)}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-left transition-colors',
                      active
                        ? 'border-signal bg-accent text-foreground'
                        : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    ].join(' ')}
                  >
                    <Icon className={active ? 'h-4 w-4 text-signal' : 'h-4 w-4'} />
                    <span className="font-body text-sm tracking-wide">{t.views[view]}</span>
                    {badge ? (
                      <span className="ml-auto min-w-5 bg-signal px-1.5 py-0.5 text-center font-mono text-[10px] text-signal-foreground">
                        {badge}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {navFooter && (
            <div className="shrink-0 border-t border-rule px-4 py-3">{navFooter}</div>
          )}
        </nav>

        {/* Active View */}
        <main
          ref={contentRef}
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-y-auto outline-none"
        >
          {children}
        </main>

        {/* Messaging Drawer — docked, persistent, closes only via its own button */}
        {messagingOpen && (
          <aside
            aria-label={messagingDrawer?.title}
            className="z-20 flex w-full max-w-full shrink-0 flex-col border-l border-border bg-panel sm:w-[340px]"
          >
            <div className="flex items-center justify-between border-b border-rule px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {messagingDrawer?.title}
              </span>
              <button
                type="button"
                onClick={onCloseMessagingDrawer}
                aria-label={t.closeMessaging}
                className="text-muted-foreground transition-colors hover:text-signal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{messagingContent}</div>
          </aside>
        )}

        {/* Coach Overlay — movable, non-modal, persistent across Views */}
        {coachOpen && (
          <CoachOverlay title={t.coachOverlayTitle} t={t} onClose={onToggleCoachOverlay}>
            {coachContent}
          </CoachOverlay>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Coach Overlay — layered over the active View, dragged by its header */
/* ------------------------------------------------------------------ */

function CoachOverlay({
  title,
  t,
  onClose,
  children,
}: {
  title: string;
  t: AppShellStrings;
  onClose?: () => void;
  children?: ReactNode;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    },
    [offset],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  }, []);

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  return (
    <aside
      aria-label={title}
      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
      className="absolute inset-x-2 bottom-2 top-2 z-50 flex flex-col border border-signal bg-panel shadow-2xl sm:inset-auto sm:bottom-4 sm:right-4 sm:top-4 sm:w-[420px]"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label={t.moveCoachOverlay}
        className="flex cursor-grab touch-none items-center justify-between border-b border-rule bg-background px-4 py-3 active:cursor-grabbing"
      >
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-signal">
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.closeCoach}
          className="text-muted-foreground transition-colors hover:text-signal"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  );
}
