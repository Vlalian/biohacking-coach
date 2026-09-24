'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  MessageSquareWarning,
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
/*  Ported from the Lovable export (iron-insight-grid, 2026-09-23):     */
/*  graphite top bar and drawer in both themes, the two-tone wordmark,  */
/*  the red Coach control, display-face nav entries.                    */
/*  Presentational only — data in via props, writes out via callbacks. */
/*  Every visible string arrives via the required `t` prop; no baked-  */
/*  in English default (handoff-contract rule 2).                      */
/* ------------------------------------------------------------------ */

/**
 * Note: there is no 'coach' View — the Coach is the always-available Overlay.
 *
 * `feedback` is a View id without being a navigable View: the Feedback Interview
 * is a real page, so it needs a path and a label, but it is reached from the
 * escape hatch in the drawer footer rather than from the View list. It is
 * therefore never in `availableViews`.
 */
export type ViewId =
  | 'training-plan'
  | 'information'
  | 'equipment'
  | 'glossary'
  | 'messaging'
  | 'settings'
  | 'privacy'
  | 'roster'
  | 'feedback';

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
  /** Rendered at the bottom of the Navigation Drawer, below the View list —
   *  the shell's own account actions (sign out) live here, always reachable
   *  regardless of scroll position. Opaque content: this component stays
   *  presentational and does not know what it renders. */
  navFooter?: ReactNode;
  /** The active View renders here. */
  children: ReactNode;
  /** The Coach Overlay body — follows the athlete across Views. */
  coachContent?: ReactNode;
  onNavigate: (view: ViewId) => void;
  onToggleNavDrawer: () => void;
  onToggleCoachOverlay?: () => void;
  onCycleTheme: () => void;
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
  // Never rendered in the nav list — `feedback` is not in `availableViews`. The
  // map is total because ViewId is a closed set, and a partial one would make
  // the next real View's missing icon a runtime hole instead of a type error.
  feedback: MessageSquareWarning,
};

/** The reference pages, listed at the foot of the drawer rather than among the daily Views. */
const FOOTER_VIEWS: ViewId[] = ['glossary', 'settings', 'privacy'];

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
  navFooter,
  children,
  coachContent,
  onNavigate,
  onToggleNavDrawer,
  onToggleCoachOverlay,
  onCycleTheme,
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

  const coachOpen = Boolean(coachOverlay?.open);

  return (
    // The dynamic viewport unit, not 100vh: 100vh is the *largest* viewport on a phone, so when
    // the file picker or the keyboard shrank it, the fixed frame stayed tall —
    // half the page white, the header pushed out of reach until a reload
    // (showable-version/30, Mads on the S5, 2026-09-17). The dynamic unit follows.
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar — always holds the drawer trigger and the theme cycle */}
      <header className="relative z-40 flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground sm:px-5">
        <button
          type="button"
          onClick={onToggleNavDrawer}
          aria-label={navDrawerOpen ? t.closeNav : t.openNav}
          aria-expanded={navDrawerOpen}
          className="inline-flex h-10 w-10 items-center justify-center border border-sidebar-border text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 items-baseline gap-3">
          <Wordmark name={t.appName} size="bar" />
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
              'inline-flex h-10 items-center gap-2 border px-3 font-display text-base font-semibold uppercase tracking-wide transition-colors',
              coachOpen
                ? 'border-signal bg-signal text-signal-foreground'
                : 'border-signal bg-signal/90 text-signal-foreground hover:bg-signal',
            ].join(' ')}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">{t.coachOverlayTitle}</span>
          </button>
          {isCoachedMode && (
            <span className="hidden border border-sidebar-primary px-2 py-1 font-body text-sm font-semibold uppercase tracking-[0.18em] text-sidebar-primary sm:inline">
              {t.coachedModeBadge}
            </span>
          )}
          {athleteName && (
            <span className="hidden font-body text-sm font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/70 md:inline">
              {athleteName}
            </span>
          )}
          <button
            type="button"
            onClick={onCycleTheme}
            aria-label={themeLabel}
            title={themeLabel}
            className="inline-flex h-10 w-10 items-center justify-center border border-sidebar-border text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
        {/* `inert`, not `aria-hidden`: the closed drawer stays mounted and only
            slides out of sight, so its buttons remain focusable — Tab would
            walk into an invisible drawer. `aria-hidden` hides it from the
            accessibility tree but does nothing about focus; `inert` removes it
            from both, and supersedes aria-hidden rather than pairing with it. */}
        <nav
          aria-label={t.navLandmark}
          inert={!navDrawerOpen}
          className={[
            'absolute inset-y-0 left-0 z-40 flex w-[86%] max-w-[300px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-200 ease-out sm:w-[20%] sm:min-w-[240px]',
            navDrawerOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-5">
            <Wordmark name={t.appName} size="drawer" />
            <button
              type="button"
              onClick={onToggleNavDrawer}
              aria-label={t.closeNav}
              className="inline-flex h-10 w-10 items-center justify-center text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-4">
            {availableViews.filter((v) => !FOOTER_VIEWS.includes(v)).map((view) => {
              const Icon = VIEW_ICONS[view];
              const active = view === currentView;
              return (
                <li key={view}>
                  <button
                    type="button"
                    onClick={() => go(view)}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left transition-colors',
                      active
                        ? 'border-signal bg-signal text-signal-foreground'
                        : 'border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-display text-base font-semibold uppercase tracking-wide">{t.views[view]}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* The reference pages sit at the bottom, above Feedback and Sign out
              (Mads, 2026-09-24); the top of the drawer is for the daily Views. */}
          <ul className="shrink-0 space-y-1 border-t border-sidebar-border px-2 py-3">
            {FOOTER_VIEWS.filter((v) => availableViews.includes(v)).map((view) => {
              const Icon = VIEW_ICONS[view];
              const active = view === currentView;
              return (
                <li key={view}>
                  <button
                    type="button"
                    onClick={() => go(view)}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'flex w-full items-center gap-3 border-l-4 px-4 py-2.5 text-left transition-colors',
                      active
                        ? 'border-signal bg-signal text-signal-foreground'
                        : 'border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="font-display text-base font-semibold uppercase tracking-wide">{t.views[view]}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {navFooter && (
            <div className="shrink-0 border-t border-sidebar-border px-2 py-3">{navFooter}</div>
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
/*  The Momentum mark (Lovable sign-in export, 2026-09-24): three       */
/*  m-glyphs, two fading into the chrome and one in the signal red,     */
/*  rolling in one after another, then the name. The name prop is the  */
/*  accessible label and the text; the glyphs are decoration.           */
/* ------------------------------------------------------------------ */

const MARK_PATH =
  'M2 19V9h3v1.25A4.1 4.1 0 0 1 8.25 8.7c1.55 0 2.75.62 3.5 1.82A4.55 4.55 0 0 1 15.4 8.7c3 0 4.6 1.85 4.6 5.05V19h-3.2v-4.85c0-1.68-.68-2.5-2.03-2.5-1.38 0-2.22.98-2.22 2.72V19H9.3v-4.85c0-1.68-.67-2.5-2.02-2.5-1.4 0-2.23.98-2.23 2.72V19H2Z';
const MARK_TONES = ['text-sidebar-foreground/20', 'text-sidebar-foreground/45', 'text-sidebar-primary'];

const WORDMARK_SIZE = {
  bar: { glyph: 'h-6 w-6', text: 'text-2xl' },
  drawer: { glyph: 'h-7 w-7', text: 'text-3xl' },
} as const;

function Wordmark({ name, size }: { name: string; size: keyof typeof WORDMARK_SIZE }) {
  const { glyph, text } = WORDMARK_SIZE[size];
  return (
    <span className="group/brand flex items-center" aria-label={name}>
      <span aria-hidden="true" className="flex items-end -space-x-2">
        {MARK_TONES.map((tone) => (
          <svg
            key={tone}
            viewBox="0 0 24 24"
            className={[
              'momentum-mark-part shrink-0 fill-current transition-transform duration-300 group-hover/brand:translate-x-0.5',
              glyph,
              tone,
            ].join(' ')}
          >
            <path d={MARK_PATH} />
          </svg>
        ))}
      </span>
      <span
        className={`momentum-wordmark ml-3 font-bold uppercase italic leading-none text-sidebar-foreground ${text}`}
      >
        {name}
      </span>
    </span>
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
        className="flex cursor-grab touch-none items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground active:cursor-grabbing"
      >
        <span className="flex items-center gap-2 font-display text-base font-semibold uppercase tracking-wide text-sidebar-primary">
          <GripHorizontal className="h-4 w-4 text-sidebar-foreground/70" />
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.closeCoach}
          className="inline-flex h-10 w-10 items-center justify-center text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  );
}
