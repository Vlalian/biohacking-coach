'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { Session } from '@/features/session/session';
import { dateKey } from '@/lib/date';
import { classifyMove, isFrozen } from '@/features/session/move-rules';
import {
  DEFAULT_TYPE_COLOR as DEFAULT_COLOR,
  TYPE_COLORS,
} from '@/features/session/type-colors';
import { moveSessionAction } from './move-actions';
import {
  markUnavailableDateAction,
  clearUnavailableDateAction,
} from './availability-actions';
import { RatingModal } from './rating-modal';

type DaySlot = {
  key: string;
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isUnavailable: boolean;
  sessions: Session[];
};

function buildMonth(
  reference: Date,
  todayKey: string,
  byDate: Map<string, Session[]>,
  unavailable: Set<string>,
): DaySlot[] {
  const year = reference.getFullYear();
  const month = reference.getMonth();

  const first = new Date(year, month, 1);
  // Monday-first grid: how many leading days from the previous month to show.
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const slots: DaySlot[] = [];
  const push = (d: Date, inMonth: boolean) => {
    const key = dateKey(d);
    slots.push({
      key,
      dayNum: d.getDate(),
      inMonth,
      isToday: key === todayKey,
      isPast: key < todayKey,
      isUnavailable: unavailable.has(key),
      sessions: byDate.get(key) ?? [],
    });
  };

  for (let i = leading; i > 0; i--) push(new Date(year, month, 1 - i), false);
  for (let d = 1; d <= daysInMonth; d++) push(new Date(year, month, d), true);
  while (slots.length % 7 !== 0) {
    const last = slots[slots.length - 1];
    const [y, m, dd] = last.key.split('-').map(Number);
    push(new Date(y, m - 1, dd + 1), false);
  }
  return slots;
}

function dotStyle(session: Session): React.CSSProperties {
  const color = TYPE_COLORS[session.type] ?? DEFAULT_COLOR;
  // A parked session is an Unavailable session awaiting re-placement — a dashed
  // outline sets it apart from planned (solid outline) and skipped (muted fill).
  if (session.parked)
    return { border: `2px dashed ${color}`, backgroundColor: 'transparent', opacity: 0.7 };
  if (session.status === 'completed') return { backgroundColor: color };
  if (session.status === 'skipped') return { backgroundColor: color, opacity: 0.4 };
  // planned — an outline; it was planned, not proven done.
  return { border: `2px solid ${color}`, backgroundColor: 'transparent' };
}

/**
 * The Training Plan calendar with Session Move and Unavailable Dates. A month
 * grid (Monday-first), one dot per session coloured by type; a planned, movable
 * session can be dragged to another day in its own week. The athlete can mark a
 * day unavailable (travel, work, life): its training is parked in place, shown
 * with a dashed dot, and clearing the day restores it. The client uses the Move
 * rules only to shape the gesture — the server re-decides and is the authority
 * (ADR 0006).
 *
 * `todayKey` is the server's day, passed in so the grid, the client's affordance
 * check, and the availability boundary all agree with the clock the server judges
 * against.
 */
export function Calendar({
  sessions,
  unavailableDates,
  todayKey,
}: {
  sessions: Session[];
  unavailableDates: string[];
  todayKey: string;
}) {
  const t = useTranslations('Calendar');
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [ratingSession, setRatingSession] = useState<Session | null>(null);

  const byDate = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  const unavailable = new Set(unavailableDates);

  const reference = new Date(`${todayKey}T00:00:00`);
  const slots = buildMonth(reference, todayKey, byDate, unavailable);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    format.dateTime(new Date(2024, 0, 1 + i), { weekday: 'short' }),
  );

  function onDrop(targetDate: string) {
    const id = draggingId;
    setDraggingId(null);
    setHoverDay(null);
    if (!id) return;

    const moving = sessions.find((s) => s.id === id);
    // Client-side affordance check only — the server re-runs this and decides.
    // Skipping a doomed request keeps the UI honest; it is not the gate.
    if (!moving || classifyMove(moving, targetDate, todayKey) !== 'move') return;

    startTransition(async () => {
      await moveSessionAction(id, targetDate);
      router.refresh();
    });
  }

  // Marking and clearing an Unavailable Date. The server is the authority on the
  // past-date boundary and the auto-restore; this just sends the intent and
  // refreshes. A refresh in flight disables the controls so a day is not double-
  // toggled mid-request.
  function toggleAvailability(date: string, currentlyUnavailable: boolean) {
    startTransition(async () => {
      if (currentlyUnavailable) await clearUnavailableDateAction(date);
      else await markUnavailableDateAction(date);
      router.refresh();
    });
  }

  return (
    <section className="w-full max-w-3xl" aria-busy={pending}>
      <h2 className="mb-3 text-lg font-semibold">
        {format.dateTime(reference, { month: 'long', year: 'numeric' })}
      </h2>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-neutral-200 bg-neutral-200 text-sm dark:border-neutral-700 dark:bg-neutral-700">
        {weekdays.map((label, i) => (
          <div
            key={`dow-${i}`}
            className="bg-neutral-50 p-2 text-center text-xs font-medium text-neutral-500 dark:bg-neutral-900"
          >
            {label}
          </div>
        ))}

        {slots.map((slot) => (
          <div
            key={slot.key}
            data-date={slot.key}
            data-unavailable={slot.isUnavailable}
            onDragOver={(e) => {
              if (draggingId) {
                e.preventDefault();
                setHoverDay(slot.key);
              }
            }}
            onDrop={() => onDrop(slot.key)}
            className={[
              'group relative min-h-16 p-1.5',
              slot.isUnavailable
                ? 'bg-neutral-100 dark:bg-neutral-900'
                : 'bg-white dark:bg-neutral-950',
              slot.inMonth ? '' : 'opacity-40',
              slot.isToday ? 'ring-2 ring-inset ring-blue-500' : '',
              hoverDay === slot.key ? 'bg-blue-50 dark:bg-blue-950' : '',
            ].join(' ')}
            title={slot.isUnavailable ? t('unavailableDay') : undefined}
          >
            <div className="flex items-start justify-between">
              <span
                className={[
                  'text-xs',
                  slot.isPast
                    ? 'text-neutral-400'
                    : 'text-neutral-600 dark:text-neutral-300',
                  slot.isUnavailable ? 'line-through' : '',
                ].join(' ')}
              >
                {slot.dayNum}
              </span>

              {/* Mark / clear an Unavailable Date. Shown for the current and
                  future days; a past day is history and cannot be re-marked.
                  Kept keyboard-reachable — the hover-reveal is only opacity. */}
              {slot.isUnavailable ? (
                <button
                  type="button"
                  data-availability-toggle={slot.key}
                  disabled={pending}
                  onClick={() => toggleAvailability(slot.key, true)}
                  aria-label={t('clearUnavailable', { date: slot.key })}
                  className="text-xs leading-none text-amber-600 dark:text-amber-500"
                >
                  ✕
                </button>
              ) : !slot.isPast ? (
                <button
                  type="button"
                  data-availability-toggle={slot.key}
                  disabled={pending}
                  onClick={() => toggleAvailability(slot.key, false)}
                  aria-label={t('markUnavailable', { date: slot.key })}
                  className="text-xs leading-none text-neutral-400 opacity-0 focus:opacity-100 group-hover:opacity-100"
                >
                  −
                </button>
              ) : null}
            </div>

            {slot.sessions.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {slot.sessions.map((s) => {
                  // A completed session is rateable — click opens the Session
                  // Reflection. It is a real button, so it is keyboard-operable
                  // (a completed session is frozen, so it never drags anyway).
                  if (s.status === 'completed') {
                    const rated = s.feedbackBody != null;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        data-session-id={s.id}
                        data-rated={rated}
                        onClick={() => setRatingSession(s)}
                        title={s.title ?? s.type}
                        aria-label={t('rate', { type: s.type })}
                        // Padded to a ~24px tap target around the 10px dot,
                        // pulled back with negative margin so the layout is
                        // unchanged — the dot stays small, the hit area does not.
                        className="-m-1.5 inline-flex cursor-pointer items-center justify-center p-1.5"
                      >
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${rated ? 'ring-1 ring-neutral-600 ring-offset-1 dark:ring-neutral-300' : ''}`}
                          style={dotStyle(s)}
                        />
                      </button>
                    );
                  }
                  // A parked session is awaiting re-placement — it does not drag.
                  // Its way back is clearing the day (auto-restore) or the Weekly
                  // Session, not another drag while still parked.
                  const movable = !isFrozen(s, todayKey) && !s.parked;
                  return (
                    <span
                      key={s.id}
                      data-session-id={s.id}
                      data-parked={s.parked}
                      draggable={movable}
                      onDragStart={() => setDraggingId(s.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setHoverDay(null);
                      }}
                      title={s.parked ? t('parked') : (s.title ?? s.type)}
                      className={`inline-block h-2.5 w-2.5 rounded-full ${movable ? 'cursor-grab' : ''} ${draggingId === s.id ? 'opacity-50' : ''}`}
                      style={dotStyle(s)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {sessions.length === 0 && (
        <p className="mt-3 text-sm text-neutral-500">{t('empty')}</p>
      )}

      {ratingSession && (
        <RatingModal
          session={ratingSession}
          onClose={() => setRatingSession(null)}
        />
      )}
    </section>
  );
}
