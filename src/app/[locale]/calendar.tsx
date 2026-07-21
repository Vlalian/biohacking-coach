'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { Session } from '@/features/session/session';
import { dateKey } from '@/lib/date';
import { classifyMove, isFrozen } from '@/features/session/move-rules';
import { moveSessionAction } from './move-actions';
import { RatingModal } from './rating-modal';

// Session dot colours by type, carried over from the POC's SESSION_COLORS. The
// names are the training vocabulary and stay as-is; only the values live here.
const TYPE_COLORS: Record<string, string> = {
  Endurance: '#4a90d9',
  Intensity: '#e05555',
  Tempo: '#c9a96e',
  Recovery: '#6db36d',
  Rest: '#8a8a8a',
  Strength: '#9b6dd6',
  Mobility: '#4db6ac',
  Other: '#9e9e9e',
};
const DEFAULT_COLOR = '#8a8a8a';

type DaySlot = {
  key: string;
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  sessions: Session[];
};

function buildMonth(reference: Date, todayKey: string, byDate: Map<string, Session[]>): DaySlot[] {
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
  if (session.status === 'completed') return { backgroundColor: color };
  if (session.status === 'skipped') return { backgroundColor: color, opacity: 0.4 };
  // planned — an outline; it was planned, not proven done.
  return { border: `2px solid ${color}`, backgroundColor: 'transparent' };
}

/**
 * The Training Plan calendar with Session Move. A month grid (Monday-first), one
 * dot per session coloured by type; a planned, movable session can be dragged to
 * another day in its own week. The client uses the Move rules only to shape the
 * gesture (what looks draggable, which drop is worth sending) — the server
 * re-decides and is the authority (ADR 0006).
 *
 * `todayKey` is the server's day, passed in so the grid and the client's
 * affordance check agree with the clock the move is judged against.
 */
export function Calendar({
  sessions,
  todayKey,
}: {
  sessions: Session[];
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

  const reference = new Date(`${todayKey}T00:00:00`);
  const slots = buildMonth(reference, todayKey, byDate);
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
            onDragOver={(e) => {
              if (draggingId) {
                e.preventDefault();
                setHoverDay(slot.key);
              }
            }}
            onDrop={() => onDrop(slot.key)}
            className={[
              'min-h-16 bg-white p-1.5 dark:bg-neutral-950',
              slot.inMonth ? '' : 'opacity-40',
              slot.isToday ? 'ring-2 ring-inset ring-blue-500' : '',
              hoverDay === slot.key ? 'bg-blue-50 dark:bg-blue-950' : '',
            ].join(' ')}
          >
            <div
              className={`text-xs ${slot.isPast ? 'text-neutral-400' : 'text-neutral-600 dark:text-neutral-300'}`}
            >
              {slot.dayNum}
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
                        className={`inline-block h-2.5 w-2.5 cursor-pointer rounded-full ${rated ? 'ring-1 ring-neutral-600 ring-offset-1 dark:ring-neutral-300' : ''}`}
                        style={dotStyle(s)}
                      />
                    );
                  }
                  const movable = !isFrozen(s, todayKey);
                  return (
                    <span
                      key={s.id}
                      data-session-id={s.id}
                      draggable={movable}
                      onDragStart={() => setDraggingId(s.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setHoverDay(null);
                      }}
                      title={s.title ?? s.type}
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
