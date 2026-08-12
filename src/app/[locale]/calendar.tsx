'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { ChevronDown, ChevronsUpDown, Plus, type LucideIcon } from 'lucide-react';
import type { Session } from '@/features/session/session';
import { dateKey, weekStartOf } from '@/lib/date';
import { classifyMove, isFrozen } from '@/features/session/move-rules';
import { DEFAULT_TYPE_COLOR, TYPE_COLORS } from '@/features/session/type-colors';
import { moveSessionAction } from './move-actions';
import { markUnavailableDateAction, clearUnavailableDateAction } from './availability-actions';
import { RatingModal } from './rating-modal';
import { SessionDrawer, type DrawerState } from './session-drawer';

type BounceReason = 'past-day' | 'other-week' | 'frozen';

type Day = {
  date: string;
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isUnavailableDate: boolean;
  sessions: Session[];
};

type Week = {
  isoWeekStart: string;
  days: Day[];
};

function buildWeeks(
  reference: Date,
  todayKey: string,
  byDate: Map<string, Session[]>,
  unavailable: Set<string>,
): Week[] {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const first = new Date(year, month, 1);
  const leading = (first.getDay() + 6) % 7; // Monday-first grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const slots: Day[] = [];
  const push = (d: Date, inMonth: boolean) => {
    const key = dateKey(d);
    slots.push({
      date: key,
      dayNum: d.getDate(),
      inMonth,
      isToday: key === todayKey,
      isPast: key < todayKey,
      isUnavailableDate: unavailable.has(key),
      sessions: byDate.get(key) ?? [],
    });
  };

  for (let i = leading; i > 0; i--) push(new Date(year, month, 1 - i), false);
  for (let d = 1; d <= daysInMonth; d++) push(new Date(year, month, d), true);
  while (slots.length % 7 !== 0) {
    const last = slots[slots.length - 1];
    const [y, m, dd] = last.date.split('-').map(Number);
    push(new Date(y, m - 1, dd + 1), false);
  }

  const weeks: Week[] = [];
  for (let i = 0; i < slots.length; i += 7) {
    const days = slots.slice(i, i + 7);
    weeks.push({ isoWeekStart: weekStartOf(days[0].date), days });
  }
  return weeks;
}

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? DEFAULT_TYPE_COLOR;
}

function dotStyle(session: Session): React.CSSProperties {
  const color = typeColor(session.type);
  if (session.parked)
    return { border: `2px dashed ${color}`, backgroundColor: 'transparent', opacity: 0.7 };
  if (session.status === 'completed') return { backgroundColor: color };
  if (session.status === 'skipped') return { backgroundColor: color, opacity: 0.4 };
  return { border: `2px solid ${color}`, backgroundColor: 'transparent' };
}

/**
 * The Training Plan calendar (CONTEXT.md): a rolling monthly grid, weeks as
 * collapsed dot rows by default, tapping a week row expands it into
 * draggable Session Blocks — Session Move only works from there, which makes
 * the Mon–Sun boundary the drag is legal within visually obvious (it used to
 * be a tiny always-on dot with no week framing, so an illegal cross-week drop
 * just silently did nothing). An illegal drop now bounces with a visible
 * reason instead of nothing happening.
 */
export function Calendar({
  sessions,
  unavailableDates,
  todayKey,
  readOnly = false,
}: {
  sessions: Session[];
  unavailableDates: string[];
  todayKey: string;
  /** A read-only calendar (Head Coach's Roster View) shows the plan, affords
   *  no changes — no drag, no rate, no drawer actions. */
  readOnly?: boolean;
}) {
  const t = useTranslations('Calendar');
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [viewedMonth, setViewedMonth] = useState(() => {
    const [y, m] = todayKey.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });
  const [expanded, setExpanded] = useState<string[]>([weekStartOf(todayKey)]);
  const [dragging, setDragging] = useState<{ session: Session; week: string } | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [bounce, setBounce] = useState<{ date: string; reason: BounceReason } | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [ratingSession, setRatingSession] = useState<Session | null>(null);

  const byDate = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  const unavailable = new Set(unavailableDates);
  const weeks = buildWeeks(viewedMonth, todayKey, byDate, unavailable);
  const allExpanded = weeks.length > 0 && weeks.every((w) => expanded.includes(w.isoWeekStart));
  const hasAnySession = sessions.length > 0;

  function toggleWeek(isoWeekStart: string) {
    setExpanded((prev) =>
      prev.includes(isoWeekStart) ? prev.filter((w) => w !== isoWeekStart) : [...prev, isoWeekStart],
    );
  }

  function toggleAllWeeks() {
    setExpanded(allExpanded ? [] : weeks.map((w) => w.isoWeekStart));
  }

  // The real rule (also the server's, session-move.ts): this only decides
  // which bounce message to show, never whether the drop is actually legal —
  // that is re-decided server-side regardless (ADR 0006).
  function rejectionFor(day: Day): BounceReason | null {
    if (!dragging) return null;
    const verdict = classifyMove(
      { date: dragging.session.date, status: dragging.session.status },
      day.date,
      todayKey,
    );
    if (verdict === 'move') return null;
    if (verdict === 'frozen') return 'frozen';
    // verdict === 'bounce': sub-categorize for a specific message. Dropping on
    // the session's own day is also a 'bounce' but not worth a message — it's
    // a no-op, not a mistake.
    if (day.isPast) return 'past-day';
    if (weekStartOf(day.date) !== weekStartOf(dragging.session.date)) return 'other-week';
    return null;
  }

  function handleDrop(day: Day) {
    if (!dragging) return;
    const reason = rejectionFor(day);
    setHoverDate(null);
    if (reason) {
      setBounce({ date: day.date, reason });
      window.setTimeout(() => setBounce(null), 2600);
    } else if (dragging.session.date !== day.date) {
      const id = dragging.session.id;
      startTransition(async () => {
        await moveSessionAction(id, day.date);
        router.refresh();
      });
    }
    setDragging(null);
  }

  function toggleAvailability(date: string, currentlyUnavailable: boolean) {
    startTransition(async () => {
      if (currentlyUnavailable) await clearUnavailableDateAction(date);
      else await markUnavailableDateAction(date);
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-[1100px]" aria-busy={pending}>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-foreground pb-3">
        <div className="flex items-baseline gap-4">
          <h1 className="font-display text-4xl leading-none tracking-[0.05em] text-foreground">
            {t('viewTitle')}
          </h1>
          <span className="font-mono text-xs uppercase tracking-[0.24em] text-signal">
            {format.dateTime(viewedMonth, { month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton
            onClick={() => setViewedMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          >
            {t('prevMonth')}
          </GhostButton>
          <GhostButton
            onClick={() => setViewedMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          >
            {t('nextMonth')}
          </GhostButton>
          <GhostButton onClick={toggleAllWeeks} icon={ChevronsUpDown}>
            {allExpanded ? t('collapseAll') : t('expandAll')}
          </GhostButton>
        </div>
      </header>

      {!hasAnySession && (
        // A note, not a replacement for the grid: the grid stays reachable
        // (expanded on the current week by default) so the athlete can still
        // add their own first Athlete Session via "+" — Progressive
        // Disclosure grows the plan, it never blocks the one action that
        // would grow it.
        <div className="mt-5 border border-dashed border-border bg-panel px-8 py-10 text-center">
          <h2 className="font-display text-2xl tracking-[0.04em] text-foreground">
            {t('emptyTitle')}
          </h2>
          <p className="mx-auto mt-2 max-w-sm font-body text-sm text-muted-foreground">
            {t('emptyBody')}
          </p>
        </div>
      )}

      <div className="mt-5 hidden grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border pb-1 md:grid">
        <span />
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            {format.dateTime(new Date(2024, 0, 1 + i), { weekday: 'short' })}
          </span>
        ))}
      </div>

      <div className="mt-5 divide-y divide-border border-b border-border md:mt-0">
        {weeks.map((week) => (
          <WeekRow
            key={week.isoWeekStart}
            week={week}
            expanded={expanded.includes(week.isoWeekStart)}
            readOnly={readOnly}
            todayKey={todayKey}
            dragging={dragging}
            hoverDate={hoverDate}
            bounce={bounce}
            pending={pending}
            t={t}
            rejectionFor={rejectionFor}
            onToggleWeek={() => toggleWeek(week.isoWeekStart)}
            onOpenSession={(s) => setDrawer({ open: true, mode: 'view', sessionId: s.id })}
            onOpenCreate={(date) => setDrawer({ open: true, mode: 'create', date })}
            onDragStart={(s) => setDragging({ session: s, week: week.isoWeekStart })}
            onDragEnd={() => {
              setDragging(null);
              setHoverDate(null);
            }}
            onDragOverDay={setHoverDate}
            onDropDay={handleDrop}
            onToggleAvailability={toggleAvailability}
          />
        ))}
      </div>

      <Legend t={t} />

      {!readOnly && (
        <SessionDrawer
          state={drawer}
          sessions={sessions}
          locale={locale}
          todayKey={todayKey}
          onClose={() => setDrawer({ open: false })}
          onRate={(s) => {
            setDrawer({ open: false });
            setRatingSession(s);
          }}
          onEditRequest={(s) => setDrawer({ open: true, mode: 'edit', sessionId: s.id })}
        />
      )}

      {ratingSession && (
        <RatingModal session={ratingSession} onClose={() => setRatingSession(null)} />
      )}
    </div>
  );
}

function WeekRow({
  week,
  expanded,
  readOnly,
  todayKey,
  dragging,
  hoverDate,
  bounce,
  pending,
  t,
  rejectionFor,
  onToggleWeek,
  onOpenSession,
  onOpenCreate,
  onDragStart,
  onDragEnd,
  onDragOverDay,
  onDropDay,
  onToggleAvailability,
}: {
  week: Week;
  expanded: boolean;
  readOnly: boolean;
  todayKey: string;
  dragging: { session: Session; week: string } | null;
  hoverDate: string | null;
  bounce: { date: string; reason: BounceReason } | null;
  pending: boolean;
  t: ReturnType<typeof useTranslations<'Calendar'>>;
  rejectionFor: (day: Day) => BounceReason | null;
  onToggleWeek: () => void;
  onOpenSession: (s: Session) => void;
  onOpenCreate: (date: string) => void;
  onDragStart: (s: Session) => void;
  onDragEnd: () => void;
  onDragOverDay: (date: string | null) => void;
  onDropDay: (day: Day) => void;
  onToggleAvailability: (date: string, currentlyUnavailable: boolean) => void;
}) {
  const weekLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
    new Date(`${week.isoWeekStart}T00:00:00`),
  );

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-[56px_repeat(7,minmax(0,1fr))]">
        <button
          type="button"
          onClick={onToggleWeek}
          className="flex items-center gap-1 px-2 py-3 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-signal"
        >
          <ChevronDown
            className={['h-3 w-3 transition-transform', expanded ? '' : '-rotate-90'].join(' ')}
          />
          {weekLabel}
        </button>

        {week.days.map((day) => {
          const rejection = dragging ? rejectionFor(day) : null;
          const isHover = hoverDate === day.date && Boolean(dragging);
          const isBounce = bounce?.date === day.date;

          return (
            <div
              key={day.date}
              onDragOver={(e) => {
                if (dragging) {
                  e.preventDefault();
                  onDragOverDay(day.date);
                }
              }}
              onDragLeave={() => onDragOverDay(null)}
              onDrop={(e) => {
                e.preventDefault();
                onDropDay(day);
              }}
              className={[
                'group relative min-h-[56px] border-l border-border px-2 py-2 transition-colors',
                day.inMonth ? '' : 'opacity-40',
                day.isPast ? 'opacity-70' : '',
                day.isToday ? 'bg-signal/[0.06]' : '',
                day.isUnavailableDate ? 'bg-muted/50' : '',
                isHover && !rejection ? 'bg-signal/15 outline outline-1 outline-signal' : '',
                isHover && rejection ? 'bg-destructive/10 outline outline-1 outline-destructive' : '',
                isBounce ? 'animate-pulse bg-destructive/10' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span
                  className={[
                    'font-mono text-[11px]',
                    day.isToday ? 'text-signal' : 'text-muted-foreground',
                    day.isUnavailableDate ? 'line-through' : '',
                  ].join(' ')}
                >
                  {day.dayNum}
                </span>
                <div className="flex items-center gap-1">
                  {!readOnly && !day.isPast && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onToggleAvailability(day.date, day.isUnavailableDate)}
                      aria-label={
                        day.isUnavailableDate
                          ? t('clearUnavailable', { date: day.date })
                          : t('markUnavailable', { date: day.date })
                      }
                      title={day.isUnavailableDate ? t('unavailableDay') : undefined}
                      className={[
                        'font-mono text-[11px] leading-none transition-opacity',
                        day.isUnavailableDate
                          ? 'text-signal opacity-100'
                          : 'text-muted-foreground opacity-0 focus:opacity-100 group-hover:opacity-100',
                      ].join(' ')}
                    >
                      ✕
                    </button>
                  )}
                  {!readOnly && expanded && (
                    <button
                      type="button"
                      onClick={() => onOpenCreate(day.date)}
                      aria-label={t('addSession')}
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-signal group-hover:opacity-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {expanded ? (
                <div className="mt-1.5 space-y-1">
                  {day.sessions.map((s) => (
                    <SessionBlock
                      key={s.id}
                      session={s}
                      t={t}
                      readOnly={readOnly}
                      frozen={isFrozen({ date: s.date, status: s.status }, todayKey)}
                      onOpen={() => onOpenSession(s)}
                      onDragStart={() => onDragStart(s)}
                      onDragEnd={onDragEnd}
                    />
                  ))}
                  {day.sessions.length > 1 && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                      {t('double')}
                    </span>
                  )}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1">
                  {day.sessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onOpenSession(s)}
                      title={s.title ?? s.type}
                      aria-label={`${s.type} · ${s.status}`}
                      className="-m-1.5 inline-flex cursor-pointer items-center justify-center p-1.5"
                    >
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${s.feedbackBody != null ? 'ring-1 ring-foreground/60 ring-offset-1' : ''}`}
                        style={dotStyle(s)}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {bounce && week.days.some((d) => d.date === bounce.date) && (
        <p className="flex items-center gap-2 border-t border-destructive/40 bg-destructive/5 px-3 py-1.5 font-body text-xs text-destructive">
          {bounce.reason === 'past-day' && t('bouncePastDay')}
          {bounce.reason === 'other-week' && t('bounceOtherWeek')}
          {bounce.reason === 'frozen' && t('bounceFrozen')}
        </p>
      )}
    </div>
  );
}

function SessionBlock({
  session,
  t,
  readOnly,
  frozen,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  session: Session;
  t: ReturnType<typeof useTranslations<'Calendar'>>;
  readOnly: boolean;
  frozen: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const color = typeColor(session.type);
  const muted = session.status === 'skipped' || session.status === 'unavailable';
  const draggable = !readOnly && !frozen && !session.parked;

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={[
        'block w-full cursor-grab border-l-2 px-1.5 py-1 text-left transition-colors active:cursor-grabbing',
        session.status === 'completed' ? 'bg-foreground/[0.05]' : '',
        muted ? 'opacity-50 line-through' : '',
        'hover:bg-foreground/[0.06]',
      ].join(' ')}
      style={{ borderColor: color }}
    >
      <span className="block truncate font-body text-[11px] font-medium leading-tight text-foreground">
        {session.title ?? session.type}
      </span>
      <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {session.duration ? `${session.duration}${t('minutes')}` : session.type}
      </span>
    </button>
  );
}

function Legend({ t }: { t: ReturnType<typeof useTranslations<'Calendar'>> }) {
  const types = ['Endurance', 'Intensity', 'Tempo', 'Recovery', 'Rest'];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
        {t('legend')}
      </span>
      {types.map((ty) => (
        <span key={ty} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: typeColor(ty) }} />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {ty}
          </span>
        </span>
      ))}
    </div>
  );
}

function GhostButton({
  children,
  onClick,
  icon: Icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 border border-border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
