'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Bandage, ChevronDown, ChevronsUpDown, Pill, Plus, type LucideIcon } from 'lucide-react';
import type { Session } from '@/features/session/session';
import { dateKey, isoWeekNumber, weekStartOf } from '@/lib/date';
import { classifyMove, isFrozen } from '@/features/session/move-rules';
import type { MoveResult } from '@/features/session/session-move';
import type { SessionConflict } from '@/features/session/conflict';
import {
  NO_WRITES,
  answerOf,
  beginMove,
  inFlightIds,
  settle,
  shownSessions,
  type WriteOutcome,
  type Writes,
} from '@/features/session/calendar-writes';
import { DEFAULT_TYPE_COLOR, TYPE_COLORS } from '@/features/session/type-colors';
import { moveSessionAction } from './move-actions';
import { markUnavailableDateAction, clearUnavailableDateAction } from './availability-actions';
import { RatingModal } from './rating-modal';
import { SessionDrawer, type DrawerState } from './session-drawer';
import { ProposalCard } from './proposal-card';
import { RedraftCard } from './redraft-card';
import { DraftingCard } from './drafting-card';
import type { CalendarSlotState } from '@/features/coach/week-draft-service';
import { HealthDrawer, type HealthDrawerState } from './health-drawer';
import { marksFor, weekStatus, type HealthMark, type HealthSpan } from '@/features/health/health-layer';

/**
 * The seven header labels are formatted from these — Monday 1 January 2024 at
 * **UTC** midnight, and always in UTC — so the weekday does not depend on the
 * server's zone or the browser's. A local-midnight `Date` formatted in
 * another zone read as the day before: on Vercel (UTC) every European tester
 * saw Monday under SØN. (`showable-version/25`, Mads, 2026-09-17).
 */
export const HEADER_DAYS: readonly Date[] = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)));

// 'conflict' is the only reason the client cannot predict: it means someone
// else — the Head Coach — changed this session while it was on screen, so the
// move was refused rather than allowed to overwrite them (versioned-write.ts).
type BounceReason = 'past-day' | 'other-week' | 'frozen' | 'conflict' | 'parked' | 'saving';

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
  | 'not-a-coach'
  // The call itself failed — network or server — so there is no answer to read.
  | 'unreachable';

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
// Export-for-test: the chip that calls this sits inside a client component,
// and the repo has no DOM renderer to reach its refusal through a drag. Delete
// freely if this is inlined.
export function liftRefusal(
  session: { date: string; status: string; parked: boolean },
  todayKey: string,
  /** A write to this session is still waiting on the server (showable-version/44). */
  inFlight = false,
): LiftRefusal | null {
  if (isFrozen({ date: session.date, status: session.status }, todayKey)) return 'frozen';
  if (session.parked) return 'parked';
  return inFlight ? 'saving' : null;
}

type LiftRefusal = Extract<BounceReason, 'frozen' | 'parked' | 'saving'>;

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
  saving: 'bounceSaving',
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
  unreachable: 'bounceError',
};

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
  phase = null,
  addPanel,
}: {
  sessions: Session[];
  /**
   * The two lines under the month (Mads, 2026-09-24, from the export's
   * Information header): the block today falls in with the week inside it,
   * and the race with the days to go. Null renders nothing — an athlete with
   * no race or no block gets the month alone, not a placeholder.
   */
  phase?: { blockName: string; week: number; weeks: number; raceName: string; daysToRace: number } | null;
  unavailableDates: string[];
  /**
   * The athlete's Injuries and Illnesses, open and closed, drawn as a layer
   * beside the plan (`training-architecture/06`).
   *
   * `[]` is *nothing recorded* and reads as a clean week. **`null` is
   * *withheld*** — a Head Coach the athlete has not shared their reports with —
   * and draws no layer at all: no marks, no status area, no drawer. The two
   * cannot collapse into one, or a coach could tell "no injuries" from "not
   * shared" and infer health from absence, which is the inference
   * `roster-service.ts` refuses to allow by not even fetching the records
   * (`showable-version/28b`).
   */
  health?: HealthSpan[] | null;
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
  ) => Promise<
    { ok: true; version: number } | { ok: false; reason: MoveRefusal; conflict?: SessionConflict }
  >;
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
  proposal?: CalendarSlotState | null;
  /**
   * The Head Coach's add form, rendered beneath the calendar and handed its
   * writes, so a prescription shows on the calendar the moment it is added and
   * the server's answer settles it (showable-version/44). A form outside the
   * calendar could only refresh the page.
   */
  addPanel?: (writer: CalendarWriter) => React.ReactNode;
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
  // This calendar's own writes (showable-version/44). What it renders is derived
  // from the props and these, never a copy of the props, so a refresh landing
  // mid-write cannot undo the write — see calendar-writes.ts.
  const [writes, setWrites] = useState<Writes>(NO_WRITES);
  const shown = shownSessions(sessions, writes);
  const inFlight = new Set(inFlightIds(writes));
  // For the drawer: it starts a write on what is shown now, and settles it
  // with the server's answer.
  const beginWrite = (start: (w: Writes, current: Session[]) => Writes) =>
    setWrites((w) => start(w, shownSessions(sessions, w)));
  const settleWrite = (key: string, outcome: WriteOutcome) => setWrites((w) => settle(w, key, outcome));

  const byDate = new Map<string, Session[]>();
  for (const s of shown) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  const unavailable = new Set(unavailableDates);
  // The drafted week lives in the card above the grid and nowhere else
  // (training-architecture/25): a proposal is not a session, and a grid that
  // ghosted one taught the athlete it shows things it does not mean.
  const weeks = buildWeeks(viewedMonth, todayKey, byDate, unavailable);
  const allExpanded = weeks.length > 0 && weeks.every((w) => expanded.includes(w.isoWeekStart));
  const hasAnySession = shown.length > 0;

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
      const target = day.date;
      // The chip lands on its new day now; the server's answer settles it. No
      // page re-render: the version that comes back is all the chip needs.
      beginWrite((w, current) => beginMove(w, current, id, target));
      startTransition(async () => {
        // Both callers carry the version the client read, so a move that lost
        // a race is refused rather than silently winning. `onMove` is the Head
        // Coach's path (it acts on someone else's calendar and needs the
        // athlete id), the default is the athlete's own.
        const result = await answerOf(() =>
          onMove ? onMove(id, target, version) : moveSessionAction(id, target, version),
        );
        // A refusal puts the chip back — or, on a conflict, where the winner put it.
        settleWrite(id, result.ok ? result : { ok: false, conflict: 'conflict' in result ? result.conflict : undefined });
        // A refused move used to look identical to a successful one, because
        // the result was discarded and the refresh put the session back where
        // it started. Say so instead — for *every* reason. This matched only
        // `conflict` until 2026-09-04, so the sentence above was true of one
        // refusal out of five and silently false of the rest.
        if (!result.ok) {
          setBounce({ date: target, messageKey: MOVE_REFUSAL_KEY[result.reason] });
          window.setTimeout(() => setBounce(null), 4000);
        }
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
    <>
      <div className="w-full max-w-[1500px]" aria-busy={pending}>
        {/* The export's header (iron-insight-grid, 2026-09-23): the View name as a
            kicker, the month as the display headline with the year in signal. */}
        <header className="flex flex-wrap items-end justify-between gap-5 border-b-4 border-foreground pb-5">
          <div>
            <h1 className="font-display text-5xl font-bold uppercase italic leading-none tracking-tight text-foreground lg:text-6xl">
              {format.dateTime(viewedMonth, { month: 'long' })}{' '}
              <span className="text-signal">{format.dateTime(viewedMonth, { year: 'numeric' })}</span>
            </h1>
            {phase && (
              <div className="mt-3 flex flex-col gap-1 font-body text-sm uppercase tracking-[0.18em] text-muted-foreground" data-phase-line="">
                <span>{t('phaseLine', { block: phase.blockName, week: phase.week, weeks: phase.weeks })}</span>
                <span>
                  {phase.raceName} ·{' '}
                  <span className="text-signal">
                    {t('raceLine', { days: phase.daysToRace })}
                  </span>
                </span>
              </div>
            )}
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
        {proposal?.kind === 'drafting' && (
          // The draft is being written this very request, by the shell's
          // after(); the slot says so and re-reads until it lands (29).
          <div className="mt-5">
            <DraftingCard weekStart={proposal.weekStart} waiter={{ side: 'athlete' }} />
          </div>
        )}
        {proposal?.kind === 'redraft-offer' && (
          // A declined week with no plan: the one offer to draft it again
          // (training-architecture/24). The card's place, not the calendar's.
          <div className="mt-5">
            <RedraftCard weekStart={proposal.weekStart} />
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
          <div className="mt-6 border border-dashed border-border bg-panel px-8 py-10 text-center">
            <h2 className="font-display text-3xl font-bold uppercase italic tracking-[0.02em] text-foreground">
              {t('emptyTitle')}
            </h2>
            <p className="mx-auto mt-2 max-w-sm font-body text-base text-muted-foreground">
              {t('emptyBody')}
            </p>
          </div>
        )}

        <div className="mt-6 hidden grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-border pb-2 md:grid">
          <span />
          {HEADER_DAYS.map((day, i) => (
            <span
              key={i}
              className="px-2.5 font-body text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground"
            >
              {format.dateTime(day, { weekday: 'short', timeZone: 'UTC' })}
            </span>
          ))}
        </div>

        <div className="mt-6 divide-y divide-border border-b border-border md:mt-0">
          {weeks.map((week) => (
            <WeekRow
              key={week.isoWeekStart}
              week={week}
              expanded={expanded.includes(week.isoWeekStart)}
              readOnly={readOnly}
              canOpenSession={!readOnly || Boolean(coachAthleteId)}
              canDrag={canDrag}
              todayKey={todayKey}
              dragging={dragging}
              hoverDate={hoverDate}
              bounce={bounce}
              pending={pending}
              inFlight={inFlight}
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
              health={health}
              onOpenHealth={(kind) => setHealthDrawer({ open: true, kind })}
            />
          ))}
        </div>

        <Legend t={t} />

        {(!readOnly || coachAthleteId) && (
          <SessionDrawer
            coachAthleteId={coachAthleteId}
            state={drawer}
            sessions={shown}
            onBeginWrite={beginWrite}
            onSettleWrite={settleWrite}
            inFlightIds={[...inFlight]}
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

        {healthDrawer.open && health && (
          <HealthDrawer
            state={healthDrawer}
            spans={health}
            locale={locale}
            coachAthleteId={coachAthleteId}
            onClose={() => setHealthDrawer({ open: false })}
          />
        )}
      </div>
      {/* A sibling of the grid, not inside it, so the page lays it out as before. */}
      {addPanel?.({ begin: beginWrite, settle: settleWrite })}
    </>
  );
}

/** A calendar's writes, lent to a form beside it: start one, then settle it with the server's answer. */
export type CalendarWriter = {
  begin: (start: (writes: Writes, shown: Session[]) => Writes) => void;
  settle: (key: string, outcome: WriteOutcome) => void;
};

function WeekRow({
  week,
  expanded,
  readOnly,
  canOpenSession,
  canDrag,
  todayKey,
  dragging,
  hoverDate,
  bounce,
  pending,
  inFlight,
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
  health,
  onOpenHealth,
}: {
  week: Week;
  expanded: boolean;
  readOnly: boolean;
  /** Every span, open and closed: the marks on a session outlive the record (28a). */
  /** Null when the athlete withholds their reports — the row then draws no health at all. */
  health: HealthSpan[] | null;
  /** Opens the Health Drawer on the newest open record of that kind. */
  onOpenHealth: (kind: 'injury' | 'illness') => void;
  /** Whether a session opens a drawer. Not `!readOnly`: the Head Coach's
   *  calendar is read-only and opens one (showable-version/20). */
  canOpenSession: boolean;
  /** Whether Session Chips may be dragged — not implied by `readOnly`. */
  canDrag: boolean;
  todayKey: string;
  dragging: { session: Session; week: string } | null;
  hoverDate: string | null;
  bounce: { date: string; messageKey: string } | null;
  pending: boolean;
  /** Sessions with a write still waiting on the server: not liftable until it answers. */
  inFlight: Set<string>;
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
  // The ISO week number, as the export's gutter shows it (Mads, 2026-09-24:
  // "the first day of the week instead of the week number"). Computed in UTC
  // from the Monday key, so it cannot depend on the server's or the browser's
  // zone — the same reason the header days are formatted in UTC.
  const weekLabel = t('weekNumber', { n: isoWeekNumber(week.isoWeekStart) });

  const status = health && weekStatus(week.days.map((d) => d.date), health, todayKey);

  return (
    <div>
      {/* The health status area, above the seven day cells and beside the plan
          (training-architecture/06 → showable-version/28a, Mads 2026-09-18).
          Shown on every week the athlete can see, so a clean one reads
          "healthy · uninjured" rather than showing nothing: two statuses, each
          a door into the Health Drawer. Absent entirely when the layer is
          withheld (`health` null), because "uninjured" is a claim and a coach
          who was not shown the records has not been told it (28b).
          The illness band and the injury chip it replaces are gone; what a
          record covered now shows on the sessions themselves (`Marks`).
          Muted, never red — the point is "no alarm, no demand for an
          explanation"; the open status carries the signal colour and nothing
          more. */}
      {status && (
        <div
          data-health-status={week.isoWeekStart}
          className="flex flex-wrap items-center gap-3 border-b border-dashed border-border px-2 py-1.5 md:pl-[72px]"
        >
          <StatusButton
            kind="injury"
            active={status.injured}
            label={status.injured ? t('statusInjured') : t('statusUninjured')}
            onClick={() => onOpenHealth('injury')}
          />
          <StatusButton
            kind="illness"
            active={status.ill}
            label={status.ill ? t('statusIll') : t('statusHealthy')}
            onClick={() => onOpenHealth('illness')}
          />
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
        className="grid grid-cols-1 md:grid-cols-[64px_repeat(7,minmax(0,1fr))]"
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
          className="relative flex items-start gap-1 overflow-hidden bg-sidebar px-2.5 py-3 text-left font-display text-base font-bold uppercase italic tracking-[0.04em] text-sidebar-foreground outline-none transition-colors hover:text-sidebar-primary focus-visible:text-sidebar-primary focus-visible:ring-1 focus-visible:ring-sidebar-primary md:flex-col"
        >
          <span className="absolute left-0 top-0 h-full w-[3px] bg-signal" aria-hidden="true" />
          <ChevronDown
            className={['mt-1 h-3.5 w-3.5 shrink-0 transition-transform', expanded ? '' : '-rotate-90'].join(' ')}
          />
          <span className="leading-tight">{weekLabel}</span>
        </button>

        {week.days.map((day) => {
          const rejection = dragging ? rejectionFor(day) : null;
          // The icons every recorded session on this day carries (28a): an
          // injury or illness whose span covers the day. Proposed sessions
          // are the future and carry none.
          const marks = health ? marksFor(day.date, health, todayKey) : [];
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
                'group relative min-h-[56px] border-l border-border bg-panel px-2.5 py-2.5 transition-colors',
                expanded ? 'md:min-h-[132px]' : '',
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
                    'font-display text-2xl font-bold leading-none',
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
                        'font-body text-base leading-none transition-opacity',
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
                      <Plus className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>

              {expanded ? (
                <div className="mt-2 space-y-2">
                  {day.sessions.map((s) => (
                    <SessionChip
                      key={s.id}
                      session={s}
                      t={t}
                      marks={marks}
                      canDrag={canDrag}
                      refusal={liftRefusal(s, todayKey, inFlight.has(s.id))}
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
                    <span className="font-body text-[13px] uppercase tracking-[0.16em] text-muted-foreground">
                      {t('double')}
                    </span>
                  )}
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
                        title={markedLabel(s.title ?? s.type, marks, t)}
                        role="img"
                        aria-label={markedLabel(`${s.type} · ${s.status}`, marks, t)}
                        className="-m-1.5 inline-flex items-center justify-center gap-0.5 p-1.5"
                      >
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${s.feedbackBody != null ? 'ring-1 ring-foreground/60 ring-offset-1' : ''}`}
                          style={dotStyle(s)}
                        />
                        <Marks marks={marks} size={8} />
                      </span>
                    ) : (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onOpenSession(s)}
                        title={markedLabel(s.title ?? s.type, marks, t)}
                        aria-label={markedLabel(`${s.type} · ${s.status}`, marks, t)}
                        className="-m-1.5 inline-flex cursor-pointer items-center justify-center gap-0.5 p-1.5"
                      >
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${s.feedbackBody != null ? 'ring-1 ring-foreground/60 ring-offset-1' : ''}`}
                          style={dotStyle(s)}
                        />
                        <Marks marks={marks} size={8} />
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {bounce && week.days.some((d) => d.date === bounce.date) && (
        <p className="flex items-center gap-2 border-t border-destructive/40 bg-destructive/5 px-3 py-2 font-body text-sm text-destructive">
          {t(bounce.messageKey)}
        </p>
      )}
    </div>
  );
}

/** The one icon per record kind, shared by the status area and the session marks. */
const HEALTH_ICON: Record<'injury' | 'illness', LucideIcon> = { injury: Bandage, illness: Pill };

/** One of the two statuses: icon + word, signal while a record of that kind is open this week. */
function StatusButton({
  kind,
  active,
  label,
  onClick,
}: {
  kind: 'injury' | 'illness';
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = HEALTH_ICON[kind];
  return (
    <button
      type="button"
      data-status={kind}
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 font-body text-[13px] font-semibold uppercase tracking-[0.14em] transition-colors hover:text-foreground',
        active ? 'text-signal' : 'text-muted-foreground',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * The health icons a session carries (`showable-version/28a`): a bandage for
 * an injury, a pill for an illness — signal while the record is open, muted
 * once it is over, and never removed: a session done hurt was done hurt. One
 * icon per record, so two open injuries are two bandages.
 */
function Marks({ marks, size }: { marks: HealthMark[]; size: number }) {
  if (marks.length === 0) return null;
  return (
    <>
      {marks.map((m, i) => {
        const Icon = HEALTH_ICON[m.kind];
        return (
          <Icon
            key={`${m.kind}-${i}`}
            data-mark={m.kind}
            data-open={m.open ? 'true' : 'false'}
            aria-hidden="true"
            style={{ width: size, height: size }}
            className={['shrink-0', m.open ? 'text-signal' : 'text-muted-foreground'].join(' ')}
          />
        );
      })}
    </>
  );
}

/** The accessible name with the marks spelled out: "Endurance · planned · injury: left knee · ill". */
function markedLabel(base: string, marks: HealthMark[], t: ReturnType<typeof useTranslations<'Calendar'>>): string {
  const words = marks.map((m) =>
    m.kind === 'injury' ? (m.label ? `${t('markInjury')}: ${m.label}` : t('markInjury')) : t('markIll'),
  );
  return [base, ...words].join(' · ');
}

function SessionChip({
  session,
  t,
  marks,
  canDrag,
  refusal,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  session: Session;
  t: ReturnType<typeof useTranslations<'Calendar'>>;
  /** The health icons this session carries; empty for none. */
  marks: HealthMark[];
  canDrag: boolean;
  /**
   * Why this session cannot be lifted, or null when it can — the reason rather
   * than the boolean it used to be. A chip that simply will not move, and says
   * nothing about it, is the defect this replaced: `bounceFrozen` was written
   * and translated and could never be reached, because the drag that would have
   * raised it could not start.
   */
  refusal: LiftRefusal | null;
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
    'block w-full border border-border border-l-4 bg-card px-2.5 py-2 text-left shadow-sm transition-all',
    draggable ? 'cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-md' : '',
    onOpen ? 'cursor-pointer' : '',
    session.status === 'completed' ? 'bg-muted/60' : '',
    session.parked ? 'border-dashed opacity-70' : '',
    muted ? 'opacity-50 line-through' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className="flex items-center gap-1.5">
        <span className="block min-w-0 flex-1 truncate font-display text-[15px] font-bold uppercase italic leading-tight text-foreground">
          {session.title ?? session.type}
        </span>
        <Marks marks={marks} size={14} />
      </span>
      <span className="mt-1 block font-body text-sm text-muted-foreground">
        {session.duration ? `${session.type} · ${session.duration}${t('minutes')}` : session.type}
      </span>
    </>
  );
  // The marks are icons with no text, so the chip names them for a screen
  // reader — the label is only set when there is something to say, leaving an
  // unmarked chip's markup exactly what it was.
  // An explicit label replaces the children-derived name, so it has to carry
  // the refusal too or a marked frozen chip stops saying why it will not move
  // (CodeRabbit, PR #86).
  const markLabel =
    marks.length > 0
      ? [markedLabel(session.title ?? session.type, marks, t), refusalText].filter(Boolean).join(' · ')
      : undefined;
  // The hover tooltip names the marks as well as any refusal (the ruling asked
  // for "label and tooltip"); unset when there is nothing to say.
  const title = markLabel ?? refusalText;

  if (!onOpen) {
    return (
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title={title}
        aria-label={markLabel}
        className={className}
        style={{ borderLeftColor: color }}
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
      title={title}
      aria-label={markLabel}
      className={className}
      style={{ borderLeftColor: color }}
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
    <div className="mt-4 flex flex-wrap items-center gap-4">
      <span className="font-body text-sm uppercase tracking-[0.2em] text-muted-foreground">
        {t('legend')}
      </span>
      {types.map((ty) => (
        <span key={ty} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: typeColor(ty) }} />
          <span className="font-body text-sm text-muted-foreground">
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
      className="inline-flex h-10 items-center gap-2 border border-border bg-transparent px-4 font-body text-[15px] font-medium text-foreground transition-colors hover:border-signal hover:text-signal"
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}
