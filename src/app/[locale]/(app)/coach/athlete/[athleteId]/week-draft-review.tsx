'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PLAN_TYPES } from '@/features/coach/weekly-session';
import type { WeekDraft } from '@/features/coach/week-draft';
import { addDays } from '@/lib/date';
import { approveWeekDraftAction, type ApproveActionResult } from './week-draft-actions';

/**
 * The Head Coach's review of the week the Coach drafted, a day before the
 * athlete sees it (`training-architecture/17`). One row per proposed session,
 * every field editable — the day among them — plus remove on each row and one
 * add. Mads, 2026-09-16: the coach adjusts the preview as much as possible;
 * this is core, and it has to be easy to do and to understand, so every
 * power is a visible control and nothing needs a second step on the calendar.
 *
 * The day is a choice among the seven days of the draft's week and nothing
 * else: the server refuses any other day, so the panel never offers one. One
 * button commits: approve. Nothing here writes the calendar; the approval is
 * an event the athlete's proposal is then built from, and the server strips
 * any note the coach typed before it is stored (`head-coach-week-service.ts`).
 *
 * Renders nothing when there is no draft to review, and nothing after the
 * coach has approved (the approved version is no longer "waiting").
 */

type Row = { key: number; date: string; type: string; durationMinutes: string; zone: string; note: string };

const rowsOf = (draft: WeekDraft): Row[] =>
  draft.sessions.map((s, key) => ({
    key,
    date: s.date,
    type: s.type,
    durationMinutes: s.durationMinutes === null ? '' : String(s.durationMinutes),
    zone: s.zone ?? '',
    note: s.note ?? '',
  }));

const toSessions = (rows: Row[]) =>
  rows.map((r) => ({
    date: r.date,
    type: r.type,
    durationMinutes: r.durationMinutes.trim() === '' ? null : Number(r.durationMinutes),
    zone: r.zone.trim() === '' ? null : r.zone,
    note: r.note.trim() === '' ? null : r.note,
  }));

/** Monday through Sunday of the draft's week — the only days a session may sit on. */
const daysOf = (weekStart: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

export function WeekDraftReview({ athleteId, draft }: { athleteId: string; draft: WeekDraft | null }) {
  const t = useTranslations('WeekDraftReview');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(draft ? rowsOf(draft) : []);
  // Keys outlive removals: the next added row must not reuse a removed row's.
  const [nextKey, setNextKey] = useState(draft ? draft.sessions.length : 0);
  const [notice, setNotice] = useState<string | null>(null);

  if (!draft || draft.approved) return null;

  const days = daysOf(draft.weekStart);

  const edit = (key: number, field: keyof Omit<Row, 'key'>, value: string) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, [field]: value } : x)));

  const remove = (key: number) => setRows((r) => r.filter((x) => x.key !== key));

  const add = () => {
    setRows((r) => [...r, { key: nextKey, date: days[0], type: PLAN_TYPES[0], durationMinutes: '', zone: '', note: '' }]);
    setNextKey((k) => k + 1);
  };

  const approve = () => {
    startTransition(async () => {
      setNotice(null);
      const result: ApproveActionResult = await approveWeekDraftAction(athleteId, draft.id, draft.weekStart, toSessions(rows));
      if (result.ok) {
        setNotice(result.changed ? t('approvedChanged') : t('approved'));
        router.refresh();
        return;
      }
      setNotice(result.reason === 'stale' ? t('stale') : t('error', { reason: result.reason }));
    });
  };

  const field = 'rounded border bg-background px-2 py-1 text-sm';

  return (
    <section className="w-full max-w-3xl rounded-lg border p-4" data-draft-id={draft.id}>
      <h2 className="mb-1 text-lg font-semibold">{t('title')}</h2>
      <p className="mb-3 font-body text-sm text-muted-foreground">{t('lead', { week: draft.weekStart })}</p>

      <ol className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.key} className="grid grid-cols-[auto_1fr_auto_auto_1fr_auto] items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              {t('day')}
              <select className={field} data-field="date" value={row.date} onChange={(e) => edit(row.key, 'date', e.target.value)}>
                {days.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t('type')}
              <select className={field} value={row.type} onChange={(e) => edit(row.key, 'type', e.target.value)}>
                {PLAN_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t('duration')}
              <input
                type="number"
                min={1}
                className={`w-20 ${field}`}
                value={row.durationMinutes}
                onChange={(e) => edit(row.key, 'durationMinutes', e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t('zone')}
              <input className={`w-16 ${field}`} value={row.zone} onChange={(e) => edit(row.key, 'zone', e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t('note')}
              <input className={field} value={row.note} onChange={(e) => edit(row.key, 'note', e.target.value)} />
            </label>
            <button
              type="button"
              data-action="remove"
              onClick={() => remove(row.key)}
              className="rounded border px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              aria-label={t('remove')}
            >
              {t('remove')}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" data-action="add" onClick={add} className="rounded border px-3 py-1 text-sm">
          {t('add')}
        </button>
        <button
          type="button"
          data-action="approve"
          disabled={pending}
          onClick={approve}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {t('approve')}
        </button>
      </div>

      {notice && <p className="mt-2 text-sm text-muted-foreground">{notice}</p>}
    </section>
  );
}
