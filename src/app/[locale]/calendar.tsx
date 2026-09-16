'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { ChevronDown, ChevronsUpDown, Plus, type LucideIcon } from 'lucide-react';
import type { Session } from '@/features/session/session';
import { dateKey, weekStartOf } from '@/lib/date';
import { classifyMove, isFrozen } from '@/features/session/move-rules';
import type { MoveResult } from '@/features/session/session-move';
import { DEFAULT_TYPE_COLOR, TYPE_COLORS } from '@/features/session/type-colors';
import { moveSessionAction } from './move-actions';
import { markUnavailableDateAction, clearUnavailableDateAction } from './availability-actions';
import { RatingModal } from './rating-modal';
import { SessionDrawer, type DrawerState } from './session-drawer';
import { ProposalCard } from './proposal-card';
import type { CalendarProposalState } from '@/features/coach/week-draft-repository';
import type { ProposedSession } from '@/features/coach/weekly-session';
import { HealthDrawer, type HealthDrawerState } from './health-drawer';
import { glanceParts, layerForWeek, type HealthSpan } from '@/features/health/health-layer';

// 'conflict' is the only reason the client cannot predict: it means someone
// else — the Head Coach — changed this session while it was on screen, so the
// move was refused rather than allowed to overwrite them (versioned-write.ts).
type BounceReason = 'past-day' | 'other-week' | 'frozen' | 'conflict' | 'parked';

/**
 * Every reason a Session Move can come back refused from the server, and the
 * message the athlete reads for it.
 *
 * The calendar decided two refusals for itself — a past day and another week —
 * and explained both. It explained none of the server's: `handleDrop` matched
 * `conflict` and let the rest fall through to a bare `router.refresh()`, which
 * put the chip back and looked exactly like a move that had worked. The comment
 * on that line already said what it should do — *"A refused move used to look
 * identical to a successful one... Say so instead."* — and it was true of one
 * reason out of five.
 *
 * Keyed on the server's own union, so a reason nobody mapped is a type error
 * here rather than silence in front of a tester. As in `REFUSAL_KEY`, the value
 * type is `string`: this proves every reason has an entry, not that every entry
 * names a message that exists — `calendar.test.tsx` checks that against the
 * catalogue.
 *
 * `not-found` and `not-authenticated` share the generic copy by the same rule
 * the drawer states: a missing row or a signed-out tab is not the athlete's to
 * fix, and naming it leaks the shape of the system without helping. Every other
 * reason is something the person can act on, so every other reason is named.
 */
type MoveRefusal =
  | Extract<MoveResult, { ok: false }>['reason']
  // The Head Coach's door refuses two more ways than the athlete's
  // (`moveSessionAsCoachAction`): the Coaching Link was severed under them, or
  // they hold no coach row at all. Both were invisible before this — the coach
  // dragged, and the chip went back.
  | 'not-linked'
  | 'not-a-coach';

/**
 * Why this session cannot be picked up at all, or null when it can.
 *
 * The chip already knew this and threw the reason away: `draggable` is
 * `canDrag && !frozen && !session.parked`, a boolean built from two quite
 * different refusals. So a completed session and a session parked behind a Rest
 * block were equally inert and equally silent, and `bounceFrozen` — written and
 * translated — was unreachable, because the drag that would have raised it could
 * never start.
 *
 * `isFrozen` is asked rather than re-implemented: the server applies the same
 * rules (ADR 0006), and a second copy here is how the message and the refusal
 * drift apart.
 *
 * Parked is deliberately not folded into frozen. A parked session returns to
 * planned on its own when the Rest block moves away (CONTEXT.md, Displacement);
 * telling the athlete it is frozen would describe something permanent.
 */
export function liftRefusal(
  session: { date: string; status: string; parked: boolean },
  todayKey: string,
): Extract<BounceReason, 'frozen' | 'parked'> | null {
  if (isFrozen({ date: session.date, status: session.status }, todayKey)) return 'frozen';
  if (session.parked) return 'parked';
  return null;
}

/**
 * The message for each refusal the *calendar* decides for itself, so that a
 * bounce carries a message key whoever raised it — the client's own verdict or
 * the server's. Without one vocabulary the render site has to know both, which
 * is how `bounceFrozen` ended up listed in a branch that could not be reached.
 */
export const BOUNCE_KEY: Record<BounceReason, string> = {
  'past-day': 'bouncePastDay',
  'other-week': 'bounceOtherWeek',
  frozen: 'bounceFrozen',
  conflict: 'bounceConflict',
  parked: 'bounceParked',
};

export const MOVE_REFUSAL_KEY: Record<MoveRefusal, string> = {
  conflict: 'bounceConflict',
  frozen: 'bounceFrozen',
  bounce: 'bounceRefused',
  // Reached by the Head Coach, not the athlete: `canHeadCoachMove` excludes
  // Athlete Sessions, so dragging one is refused server-side. Until now that
  // refusal was the silent one — the coach dragged, and the chip went back.
  'not-owner': 'bounceNotYours',
  'not-found': 'bounceError',
  'not-authenticated': 'bounceError',
  // Generic by the same rule: a link severed in another tab, or an account that
  // is not a coach, is a state the person cannot resolve from this drag.
  'not-linked': 'bounceError',
  'not-a-coach': 'bounceError',
};

type Day = {
  date: string;
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isUnavailableDate: boolean;
  sessions: Session[];
  /** The drafted week's sessions on this day — a proposal, not a session (training-architecture/18). */
  proposed: ProposedSession[];
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
  byDateProposed: Map<string, ProposedSession[]> = new Map(),
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
      proposed: byDateProposed.get(key) ?? [],
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
 * draggable Session Chips — Session Move only works from there, which makes
 * the Mon–Sun boundary the drag is legal within visually obvious (it used to
 * be a tiny always-on dot with no week framing, so an illegal cross-week drop
 * just silently did nothing). An illegal drop now bounces with a visible
 * reason instead of nothing happening.
 */
export function Calendar({
  sessions,
  unavailableDates,
  importedSessionIds = [],
  todayKey,
  readOnly = false,
  onMove,
  coachAthleteId,
  proposal = null,
  health = [],
}: {
  sessions: Session[];
  unavailableDates: string[];
  /**
   * The athlete's Injuries and Illnesses, open and closed, drawn as a layer
   * beside the plan (`training-architecture/06`). Empty by default so a caller
   * with nothing to show — or a Head Coach the athlete has not shared their
   * reports with — renders exactly the calendar it always did.
   */
  health?: HealthSpan[];
  /** Passed through to the Session Drawer, which offers undo on these. Empty
   *  by default so the Head Coach's read-only calendar needs no extra read. */
  importedSessionIds?: string[];
  todayKey: string;
  /** A read-only calendar (Head Coach's athlete view) shows the plan and
   *  affords none of the athlete's own actions — no rate, no drawer, no adding
   *  or marking days unavailable. Dragging is decided separately by `onMove`. */
  readOnly?: boolean;
  /**
   * Who performs a Session Move, and whether one is offered at all.
   *
   * The athlete's own calendar leaves this unset and moves through
   * {@link moveSessionAction}. The Head Coach's passes their own action, which
   * is what makes a read-only calendar draggable for them — placement became
   * shared on 2026-08-21 (ADR 0003 amendment) while everything else on that
   * surface stayed read-only, so the two had to stop being one flag.
   *
   * Either way the rules are the server's: this only decides which door the
   * request goes through, never whether the move is allowed.
   */
  onMove?: (
    sessionId: string,
    targetDate: string,
    expectedVersion: number,
  ) => Promise<{ ok: true } | { ok: false; reason: MoveRefusal }>;
  /**
   * The athlete this calendar belongs to, when the Head Coach is the one
   * looking at it. Opens the Session Drawer on their behalf.
   *
   * A read-only calendar rendered no drawer at all, so a coach could see a
   * session and never read it — not its note, not its reflection, not the
   * record they are meant to judge the plan against (showable-version/20).
   */
  coachAthleteId?: string;
  /**
   * The week the Coach drafted and the athlete has not decided on, or a pointer
   * to the conversation it moved into (`training-architecture/18`). Only the
   * athlete's own calendar passes this; the Head Coach's review is their own
   * panel (17). Absent, the calendar renders exactly as it did before 18.
   */
  proposal?: CalendarProposalState | null;
}) {
  const t = useTranslations('Calendar');
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Dragging is offered when the caller supplied a move action, or when this is
  // the athlete's own editable calendar. Deliberately not `!readOnly`: the Head
  // Coach's view is read-only in every other respect and still draggable.
  const canDrag = Boolean(onMove) || !readOnly;

  const [viewedMonth, setViewedMonth] = useState(() => {
    const [y, m] = todayKey.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });
  const [expanded, setExpanded] = useState<string[]>([weekStartOf(todayKey)]);
  const [dragging, setDragging] = useState<{ session: Session; week: string } | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [bounce, setBounce] = useState<{ date: string; messageKey: string } | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [healthDrawer, setHealthDrawer] = useState<HealthDrawerState>({ open: false });
  const [ratingSession, setRatingSession] = useState<Session | null>(null);

  const byDate = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  const unavailable = new Set(unavailableDates);
  // Ghosted onto the days they would land on — only the draft's own week can
  // carry them, because that is the only week a draft names.
  const byDateProposed = new Map<string, ProposedSession[]>();
  if (proposal?.kind === 'proposal') {
    for (const p of proposal.draft.sessions) {
      const list = byDateProposed.get(p.date);
      if (list) list.push(p);
      else byDateProposed.set(p.date, [p]);
    }
  }
  const weeks = buildWeeks(viewedMonth, todayKey, byDate, unavailable, byDateProposed);
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
      setBounce({ date: day.date, messageKey: BOUNCE_KEY[reason] });
      window.setTimeout(() => setBounce(null), 2600);
    } else if (dragging.session.date !== day.date) {
      const { id, version } = dragging.session;
      startTransition(async () => {
        // Both callers carry the version the client read, so a move that lost
        // a race is refused rather than silently winning. `onMove` is the Head
        // Coach's path (it acts on someone else's calendar and needs the
        // athlete id), the default is the athlete's own.
        const result = onMove
          ? await onMove(id, day.date, version)
          : await moveSessionAction(id, day.date, version);
        // A refused move used to look identical to a successful one, because
        // the result was discarded and the refresh put the session back where
        // it started. Say so instead — for *every* reason. This matched only
        // `conflict` until 2026-09-04, so the sentence above was true of one
        // refusal out of five and silently false of the rest.
        if (!result.ok) {
          setBounce({ date: day.date, messageKey: MOVE_REFUSAL_KEY[result.reason] });
          window.setTimeout(() => setBounce(null), 4000);
        }
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
          {!readOnly && (
            // "How's your body?" — always there for the athlete, healthy or
            // not: it is how the first injury gets declared when nothing on the
            // calendar can be clicked yet, and where "I'm back" lives too. The
            // Head Coach never sees it. (Mads, 2026-09-11: a good start, may
            // move — one button, easy to move.)
            <GhostButton onClick={() => setHealthDrawer({ open: true })}>
              {t('healthButton')}
            </GhostButton>
          )}
        </div>
      </header>

      {proposal?.kind === 'proposal' && (
        <div className="mt-5">
          <ProposalCard draft={proposal.draft} />
        </div>
      )}
      {proposal?.kind === 'discussing' && (
        // Not a second proposal: the week is in the conversation now, and this
        // says where it went (decided 2026-09-15).
        <p
          className="mt-5 border border-dashed border-signal/40 bg-signal/5 px-4 py-2 font-body text-sm text-muted-foreground"
          data-discussing={proposal.conversationId}
        >
          {t('discussing')}
        </p>
      )}

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
            canOpenSession={!readOnly || Boolean(coachAthleteId)}
            canDrag={canDrag}
            todayKey={todayKey}
            locale={locale}
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
            healthLayer={
              health.length > 0
                ? layerForWeek(
                    week.days.map((d) => d.date),
                    health,
                    todayKey,
                  )
                : null
            }
            onOpenHealth={(span) => setHealthDrawer({ open: true, kind: span.kind, id: span.id })}
          />
        ))}
      </div>

      <Legend t={t} />

      {(!readOnly || coachAthleteId) && (
        <SessionDrawer
          coachAthleteId={coachAthleteId}
          state={drawer}
          sessions={sessions}
          importedSessionIds={importedSessionIds}
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

      {healthDrawer.open && (
        <HealthDrawer
          state={healthDrawer}
          spans={health}
          locale={locale}
          coachAthleteId={coachAthleteId}
          onClose={() => setHealthDrawer({ open: false })}
        />
      )}
    </div>
  );
}

function WeekRow({
  week,
  expanded,
  readOnly,
  canOpenSession,
  canDrag,
  todayKey,
  locale,
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
  healthLayer,
  onOpenHealth,
}: {
  week: Week;
  expanded: boolean;
  readOnly: boolean;
  /** What of the athlete's health this week draws, or null for nothing at all. */
  healthLayer: ReturnType<typeof layerForWeek> | null;
  onOpenHealth: (span: HealthSpan) => void;
  /** Whether a session opens a drawer. Not `!readOnly`: the Head Coach's
   *  calendar is read-only and opens one (showable-version/20). */
  canOpenSession: boolean;
  /** Whether Session Chips may be dragged — not implied by `readOnly`. */
  canDrag: boolean;
  todayKey: string;
  locale: string;
  dragging: { session: Session; week: string } | null;
  hoverDate: string | null;
  bounce: { date: string; messageKey: string } | null;
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
  // Explicit locale and time zone: `undefined` resolves both from the runtime —
  // the server during SSR, the visitor in the browser — so the same week can
  // render as two different strings and mismatch on hydration. It also ignored
  // the app locale, putting an English week start under a Danish header. Same
  // pattern as `formatFullDate` in session-drawer.tsx.
  const weekLabel = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${week.isoWeekStart}T00:00:00Z`));

  const showHealth =
    healthLayer !== null && (healthLayer.hasIllness || healthLayer.injuries.length > 0);

  return (
    <div>
      {/* The health layer, drawn ABOVE the seven day cells and beside the plan
          (training-architecture/06, option a — Mads, 2026-09-11). An Illness is
          a band over exactly the days it covered, the way an all-day event sits
          above a day's items; an Injury is a chip at the left with what it
          prevents, on every week it was open — a standing state, not a set of
          days. Muted, never red: the point is "no alarm, no demand for an
          explanation". Absent entirely for a healthy week, so the day cells and
          Session Chips below are exactly what they always were. */}
      {showHealth && healthLayer && (
        <div
          data-health-week={week.isoWeekStart}
          className="grid grid-cols-1 border-b border-dashed border-border md:grid-cols-[56px_repeat(7,minmax(0,1fr))]"
        >
          <div className="flex flex-wrap items-center gap-1 px-2 py-1 md:col-span-8 md:pl-[64px]">
            {healthLayer.injuries.map((span) => (
              <button
                key={span.id}
                type="button"
                data-health-chip={span.id}
                onClick={() => onOpenHealth(span)}
                className="flex h-[38px] items-center border border-border bg-muted/60 px-2 text-left transition-colors hover:border-signal"
              >
                <span className="block font-body text-[11px] font-medium leading-tight text-foreground">
                  {t('healthInjury')}
                </span>
                <span className="ml-2 block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {span.capacity
                    ? glanceParts(span.capacity)
                        .map((p) => t(`glance_${p.allowance}_${p.discipline}`))
                        .join(' · ')
                    : ''}
                </span>
              </button>
            ))}
          </div>
          {healthLayer.hasIllness && (
            <>
              <span className="hidden md:block" />
              {healthLayer.days.map((day, i) => {
                const first = day.ill && (i === 0 || !healthLayer.days[i - 1].ill);
                const span = healthLayer.illnesses.find((s) => s.id === day.illnessId) ?? null;
                return (
                  <div key={day.date} data-health-day={day.date} data-ill={day.ill || undefined} className="px-1 pb-1">
                    {span && (
                      <button
                        type="button"
                        onClick={() => onOpenHealth(span)}
                        // Only the first day carries visible text; the rest of
                        // the band would otherwise be unlabelled focus stops.
                        aria-label={t('healthIll')}
                        className="block h-6 w-full bg-muted text-left font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {first ? <span className="pl-2">{t('healthIll')}</span> : null}
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
      {/* `CONTEXT.md`, Expanded Week: "Tapping a week row toggles it." Only the
          date label was a button, so the row and the glossary disagreed.

          A handler on the row rather than a larger button, deliberately. Each
          day cell is a drop target with controls of its own, and wrapping them
          in a <button> would nest interactive elements and swallow every one of
          them. This lets anything originating inside a day through untouched.

          The button below stays and remains the accessible path: a div with an
          onClick is not reachable by keyboard, so widening the hit area for a
          mouse must not narrow who can reach it. */}
      <div
        className="grid grid-cols-1 md:grid-cols-[56px_repeat(7,minmax(0,1fr))]"
        onClick={(e) => {
          // Two things must not reach this handler. A day cell has controls of
          // its own, and the date label below is a real button that already
          // toggles — without this it would toggle twice and cancel itself out,
          // for the keyboard user it was kept for as much as for the mouse.
          if ((e.target as HTMLElement).closest('[data-day], [data-week-toggle]')) return;
          onToggleWeek();
        }}
      >
        <button
          type="button"
          // Marks this button out of the row handler above. A marker rather
          // than stopPropagation because the row's rule then stays one
          // selector, readable in one place and visible in the markup a test
          // can render.
          data-week-toggle=""
          onClick={onToggleWeek}
          // The chevron's rotation is the only cue that a week is expanded, and
          // rotation is invisible to a screen reader.
          aria-expanded={expanded}
          className="flex items-center gap-1 px-2 py-3 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground outline-none transition-colors hover:text-signal focus-visible:text-signal focus-visible:ring-1 focus-visible:ring-signal"
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
              // Read by the row's toggle handler to tell "clicked the week" from
              // "clicked inside a day". Without it the row would swallow the
              // day's own controls — the ✕, the +, a Session Chip, a drag.
              data-day={day.date}
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
                      // Revealed on focus as well as hover: it is invisible at
                      // rest, so without this a keyboard user tabs onto a
                      // control they cannot see. The ✕ above already does this.
                      className="text-muted-foreground opacity-0 transition-opacity hover:text-signal focus:opacity-100 focus-visible:text-signal group-hover:opacity-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {expanded ? (
                <div className="mt-1.5 space-y-1">
                  {day.sessions.map((s) => (
                    <SessionChip
                      key={s.id}
                      session={s}
                      t={t}
                      canDrag={canDrag}
                      refusal={liftRefusal(s, todayKey)}
                      // Omitted only where there is genuinely no drawer to
                      // open. A coach viewing a linked athlete has one now.
                      // Omitted only where there is genuinely no drawer to
                      // open. A coach viewing a linked athlete has one now.
                      onOpen={canOpenSession ? () => onOpenSession(s) : undefined}
                      onDragStart={() => onDragStart(s)}
                      onDragEnd={onDragEnd}
                    />
                  ))}
                  {day.sessions.length > 1 && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                      {t('double')}
                    </span>
                  )}
                  {day.proposed.map((p, i) => (
                    <ProposedChip key={`${p.date}-${i}`} session={p} t={t} />
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1">
                  {day.sessions.map((s) =>
                    // Same rule as the expanded chip: with no drawer to open,
                    // the marker is an image of a session rather than a control.
                    // It keeps its label so a screen reader still announces the
                    // session — what it loses is the focus stop and the pointer
                    // that promise something to click.
                    //
                    // It asks `canOpenSession`, not `readOnly`, because those
                    // are different questions and the Head Coach answers them
                    // differently: their calendar is read-only *and* opens a
                    // drawer. Reading `readOnly` here made a session openable in
                    // an expanded week and dead in a collapsed one, while this
                    // comment claimed both branches agreed. CodeRabbit, PR #57.
                    !canOpenSession ? (
                      <span
                        key={s.id}
                        title={s.title ?? s.type}
                        role="img"
                        aria-label={`${s.type} · ${s.status}`}
                        className="-m-1.5 inline-flex items-center justify-center p-1.5"
                      >
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${s.feedbackBody != null ? 'ring-1 ring-foreground/60 ring-offset-1' : ''}`}
                          style={dotStyle(s)}
                        />
                      </span>
                    ) : (
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
                    ),
                  )}
                  {day.proposed.map((p, i) => (
                    <span
                      key={`${p.date}-${i}`}
                      role="img"
                      aria-label={proposedLabel(p, t('proposedChip'))}
                      title={p.type}
                      className="-m-1.5 inline-flex items-center justify-center p-1.5"
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground" />
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {bounce && week.days.some((d) => d.date === bounce.date) && (
        <p className="flex items-center gap-2 border-t border-destructive/40 bg-destructive/5 px-3 py-1.5 font-body text-xs text-destructive">
          {t(bounce.messageKey)}
        </p>
      )}
    </div>
  );
}

/**
 * A proposed session, ghosted where it would land (`training-architecture/18`).
 * The size of a Session Chip so the row does not jump; a dashed border and a
 * muted tone so it reads as not-yet. Not draggable, no drawer, no rating — a
 * proposal is not a session, and every control a session has is withheld.
 */

/**
 * The accessible name of a proposed session, in either rendering: what the eye
 * sees, type and minutes, then the "proposed" marker. One helper for the
 * collapsed dot and the full chip so the two cannot drift (CodeRabbit, PR #69).
 */
function proposedLabel(session: ProposedSession, proposedWord: string): string {
  return [session.type, session.durationMinutes ? `${session.durationMinutes} min` : null, proposedWord].filter(Boolean).join(' · ');
}

function ProposedChip({
  session,
  t,
}: {
  session: ProposedSession;
  t: ReturnType<typeof useTranslations<'Calendar'>>;
}) {
  return (
    <div
      role="note"
      aria-label={proposedLabel(session, t('proposedChip'))}
      data-proposed=""
      className="block w-full border border-dashed border-muted-foreground/60 px-1.5 py-1 text-left"
    >
      <span className="block truncate font-body text-[11px] font-medium leading-tight text-muted-foreground">
        {session.type}
      </span>
      <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {session.durationMinutes ? `${session.durationMinutes} min` : t('proposedChip')}
      </span>
    </div>
  );
}

function SessionChip({
  session,
  t,
  canDrag,
  refusal,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  session: Session;
  t: ReturnType<typeof useTranslations<'Calendar'>>;
  canDrag: boolean;
  /**
   * Why this session cannot be lifted, or null when it can — the reason rather
   * than the boolean it used to be. A chip that simply will not move, and says
   * nothing about it, is the defect this replaced: `bounceFrozen` was written
   * and translated and could never be reached, because the drag that would have
   * raised it could not start.
   */
  refusal: 'frozen' | 'parked' | null;
  /**
   * Omitted where there is nothing to open — the Head Coach's read-only
   * calendar, which renders no `SessionDrawer`. Without it this renders plain
   * content rather than a button, because a focusable control that does nothing
   * when clicked is worse than no control: it offers the coach a detail view
   * that is not there, and hands a keyboard user a dead stop.
   */
  onOpen?: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const color = typeColor(session.type);
  const muted = session.status === 'skipped' || session.status === 'unavailable';
  const draggable = canDrag && refusal === null;
  // Surfaced on the chip itself, because the refusal happens *before* any drop:
  // there is no bounce to attach it to, and the athlete needs it at the moment
  // they try to pick the session up.
  const refusalText = refusal ? t(BOUNCE_KEY[refusal]) : undefined;

  // Drag is deliberately independent of opening: the Head Coach may re-place a
  // session (ADR 0003, 2026-08-21 amendment) on a calendar they cannot open.
  const className = [
    'block w-full border-l-2 px-1.5 py-1 text-left transition-colors',
    draggable ? 'cursor-grab active:cursor-grabbing' : '',
    onOpen ? 'cursor-pointer hover:bg-foreground/[0.06]' : '',
    session.status === 'completed' ? 'bg-foreground/[0.05]' : '',
    muted ? 'opacity-50 line-through' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className="block truncate font-body text-[11px] font-medium leading-tight text-foreground">
        {session.title ?? session.type}
      </span>
      <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {session.duration ? `${session.duration}${t('minutes')}` : session.type}
      </span>
    </>
  );

  if (!onOpen) {
    return (
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title={refusalText}
        className={className}
        style={{ borderColor: color }}
      >
        {content}
        {refusalText && <span className="sr-only">{refusalText}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      title={refusalText}
      className={className}
      style={{ borderColor: color }}
    >
      {content}
      {/* `title` alone is a hover affordance and reaches neither a screen reader
          reliably nor a touch device at all. The visually-hidden copy is the one
          that actually carries the reason. */}
      {refusalText && <span className="sr-only">{refusalText}</span>}
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
