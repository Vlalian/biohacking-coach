'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PLAN_TYPES } from '@/features/coach/weekly-session';
import type { WeekDraft } from '@/features/coach/week-draft';
import { approveWeekDraftAction, type ApproveActionResult } from './week-draft-actions';

/**
 * The Head Coach's review of the week the Coach drafted, a day before the
 * athlete sees it (`training-architecture/17`). One row per proposed session:
 * type, minutes, zone and note are editable, the day is not — it comes from the
 * skeleton, and a coach who wants a different day edits the accepted week on
 * the calendar. One button: approve. Nothing here writes the calendar; the
 * approval is an event the athlete's proposal is then built from.
 *
 * Renders nothing when there is no draft to review, and nothing after the
 * coach has approved (the approved version is no longer "waiting").
 */

type Row = { date: string; type: string; durationMinutes: string; zone: string; note: string };

const rowsOf = (draft: WeekDraft): Row[] =>
  draft.sessions.map((s) => ({
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

export function WeekDraftReview({ athleteId, draft }: { athleteId: string; draft: WeekDraft | null }) {
  const t = useTranslations('WeekDraftReview');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(draft ? rowsOf(draft) : []);
  const [notice, setNotice] = useState<string | null>(null);

  if (!draft || draft.approved) return null;

  const edit = (i: number, field: keyof Row, value: string) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, [field]: value } : x)));

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

  return (
    <section className="w-full max-w-3xl rounded-lg border p-4" data-draft-id={draft.id}>
      <h2 className="mb-1 text-lg font-semibold">{t('title')}</h2>
      <p className="mb-3 font-body text-sm text-muted-foreground">{t('lead', { week: draft.weekStart })}</p>

      <ol className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <li key={row.date} className="grid grid-cols-[auto_1fr_auto_auto_1fr] items-end gap-3">
            <span className="pb-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{row.date}</span>
            <label className="flex flex-col gap-1 text-xs">
              {t('type')}
              <select
                className="rounded border bg-background px-2 py-1 text-sm"
                value={row.type}
                onChange={(e) => edit(i, 'type', e.target.value)}
              >
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
                className="w-20 rounded border bg-background px-2 py-1 text-sm"
                value={row.durationMinutes}
                onChange={(e) => edit(i, 'durationMinutes', e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t('zone')}
              <input
                className="w-16 rounded border bg-background px-2 py-1 text-sm"
                value={row.zone}
                onChange={(e) => edit(i, 'zone', e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t('note')}
              <input
                className="rounded border bg-background px-2 py-1 text-sm"
                value={row.note}
                onChange={(e) => edit(i, 'note', e.target.value)}
              />
            </label>
          </li>
        ))}
      </ol>

      <button
        type="button"
        disabled={pending}
        onClick={approve}
        className="mt-3 rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {t('approve')}
      </button>

      {notice && <p className="mt-2 text-sm text-muted-foreground">{notice}</p>}
    </section>
  );
}
