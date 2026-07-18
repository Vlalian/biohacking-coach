import { getTranslations, getFormatter } from 'next-intl/server';
import type { Session } from '@/features/session/session';
import { dateKey } from '@/lib/date';

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

function buildMonth(reference: Date, byDate: Map<string, Session[]>): DaySlot[] {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const todayKey = dateKey(reference);

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
  // Trailing days to complete the final week row.
  while (slots.length % 7 !== 0) {
    const last = slots[slots.length - 1];
    const [y, m, dd] = last.key.split('-').map(Number);
    push(new Date(y, m - 1, dd + 1), false);
  }
  return slots;
}

function Dot({ session }: { session: Session }) {
  const color = TYPE_COLORS[session.type] ?? DEFAULT_COLOR;
  const base = 'inline-block h-2.5 w-2.5 rounded-full';

  if (session.status === 'completed') {
    return <span className={base} style={{ backgroundColor: color }} />;
  }
  if (session.status === 'skipped') {
    return <span className={`${base} opacity-40`} style={{ backgroundColor: color }} />;
  }
  // planned — an outline; it was planned, not proven done.
  return (
    <span
      className={base}
      style={{ border: `2px solid ${color}`, backgroundColor: 'transparent' }}
    />
  );
}

/**
 * The read-only Training Plan calendar: the current month as a Monday-first
 * grid, one dot per session coloured by type. Sessions arrive already scoped to
 * the signed-in athlete and ordered by date then day_order, so grouping by date
 * preserves the within-day order.
 */
export async function Calendar({ sessions }: { sessions: Session[] }) {
  const t = await getTranslations('Calendar');
  const format = await getFormatter();

  const byDate = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }

  const now = new Date();
  const slots = buildMonth(now, byDate);

  // Weekday headers, localized: a known Monday..Sunday run formatted short.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    format.dateTime(new Date(2024, 0, 1 + i), { weekday: 'short' }),
  );

  const weeks: DaySlot[][] = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));

  return (
    <section className="w-full max-w-3xl">
      <h2 className="mb-3 text-lg font-semibold">
        {format.dateTime(now, { month: 'long', year: 'numeric' })}
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

        {weeks.flat().map((slot) => (
          <div
            key={slot.key}
            className={[
              'min-h-16 bg-white p-1.5 dark:bg-neutral-950',
              slot.inMonth ? '' : 'opacity-40',
              slot.isToday ? 'ring-2 ring-inset ring-blue-500' : '',
            ].join(' ')}
          >
            <div
              className={`text-xs ${slot.isPast ? 'text-neutral-400' : 'text-neutral-600 dark:text-neutral-300'}`}
            >
              {slot.dayNum}
            </div>
            {slot.sessions.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {slot.sessions.map((s) => (
                  <Dot key={s.id} session={s} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {sessions.length === 0 && (
        <p className="mt-3 text-sm text-neutral-500">{t('empty')}</p>
      )}
    </section>
  );
}
