'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PLAN_TYPES } from '@/features/coach/weekly-session';
import type { WeekDraft } from '@/features/coach/week-draft';
import type { HowTo } from '@/features/session/how-to';
import { HowToBlock } from '@/components/session/how-to-block';
import { addDays } from '@/lib/date';
import type { Locale } from '@/i18n/routing';
import { approveWeekDraftAction, type ApproveActionResult } from './week-draft-actions';
import {
  addedRow,
  focusText,
  howToOfRow,
  rowsOf,
  segmentMinutes,
  startEditing,
  toSessions,
  withFocusText,
  withSegment,
  type DraftRow,
} from './week-draft-rows';

/**
 * The Head Coach's review of the week the Coach drafted, a day before the
 * athlete sees it (`training-architecture/17`). One card per proposed session,
 * every field editable — the day among them — plus remove on each card and one
 * add. Mads, 2026-09-16: the coach adjusts the preview as much as possible;
 * this is core, and it has to be easy to do and to understand, so every
 * power is a visible control and nothing needs a second step on the calendar.
 *
 * The card (`training-architecture/31`, Mads's smoke run of PR #78: "way too
 * much information in one go; the note could be wider"): line one holds the
 * four short fields — day, type, minutes, zone — and remove; line two is the
 * note, full width, a textarea that grows with its text. On a phone the short
 * fields wrap to a second line and the note keeps the full width.
 *
 * The day is a choice among the seven days of the draft's week and nothing
 * else: the server refuses any other day, so the panel never offers one. One
 * button commits: approve. Nothing here writes the calendar; the approval is
 * an event the athlete's proposal is then built from, and the server strips
 * any note the coach typed before it is stored (`head-coach-week-service.ts`).
 *
 * Renders nothing when there is no draft to review, and nothing after the
 * coach has approved (the approved version is no longer "waiting").
 *
 * Each card shows the session's how-to (`training-architecture/26`, E6): the
 * template fitted to the card as it stands, Momentum's cue, and the sport with
 * Momentum's reason when it changed it. The coach can edit the how-to; their
 * text is then final, stored on the session and never refitted. The row
 * rules live in `week-draft-rows.ts`.
 */

/** Monday through Sunday of the draft's week — the only days a session may sit on. */
const daysOf = (weekStart: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

/**
 * The note textarea's `rows`: one per line of text, so the note is readable
 * where the browser lacks `field-sizing: content` (Tailwind's
 * `field-sizing-content` grows it live where it is supported).
 */
const rowsFor = (note: string): number => note.split('\n').length;

export function WeekDraftReview({ athleteId, draft }: { athleteId: string; draft: WeekDraft | null }) {
  const t = useTranslations('WeekDraftReview');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const locale = useLocale() as Locale;
  const [rows, setRows] = useState<DraftRow[]>(draft ? rowsOf(draft.sessions) : []);
  // Keys outlive removals: the next added row must not reuse a removed row's.
  const [nextKey, setNextKey] = useState(draft ? draft.sessions.length : 0);
  const [notice, setNotice] = useState<string | null>(null);

  if (!draft || draft.approved) return null;

  const days = daysOf(draft.weekStart);

  const edit = (key: number, field: 'date' | 'type' | 'durationMinutes' | 'zone' | 'note', value: string) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, [field]: value } : x)));

  const setHowTo = (key: number, coachHowTo: HowTo | null) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, coachHowTo } : x)));

  const remove = (key: number) => setRows((r) => r.filter((x) => x.key !== key));

  const add = () => {
    setRows((r) => [...r, addedRow(nextKey, days[0], PLAN_TYPES[0])]);
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

  const field = 'h-11 border border-border bg-background px-3 font-body text-base normal-case tracking-normal text-foreground outline-none focus:border-signal';

  return (
    <section className="w-full max-w-3xl border border-border bg-panel p-5 shadow-sm sm:p-6" data-draft-id={draft.id}>
      <h2 className="mb-1 font-display text-2xl font-bold uppercase italic tracking-[0.03em] text-foreground">{t('title')}</h2>
      <p className="mb-3 font-body text-sm text-muted-foreground">{t('lead', { week: draft.weekStart })}</p>

      <ol className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-3 border border-border bg-background p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
                {t('day')}
                <select className={field} data-field="date" value={row.date} onChange={(e) => edit(row.key, 'date', e.target.value)}>
                  {days.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
                {t('type')}
                <select className={field} data-field="type" value={row.type} onChange={(e) => edit(row.key, 'type', e.target.value)}>
                  {PLAN_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
                {t('duration')}
                <input
                  type="number"
                  min={1}
                  className={`w-20 ${field}`}
                  data-field="durationMinutes"
                  value={row.durationMinutes}
                  onChange={(e) => edit(row.key, 'durationMinutes', e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
                {t('zone')}
                <input className={`w-16 ${field}`} data-field="zone" value={row.zone} onChange={(e) => edit(row.key, 'zone', e.target.value)} />
              </label>
              <button
                type="button"
                data-action="remove"
                onClick={() => remove(row.key)}
                className="ml-auto inline-flex h-10 items-center border border-border px-4 font-body text-[15px] font-medium text-foreground transition-colors hover:border-signal hover:text-signal disabled:opacity-50"
                aria-label={t('remove')}
              >
                {t('remove')}
              </button>
            </div>
            <label className="flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
              {t('note')}
              <textarea
                className={`w-full field-sizing-content resize-none ${field}`}
                data-field="note"
                rows={rowsFor(row.note)}
                value={row.note}
                onChange={(e) => edit(row.key, 'note', e.target.value)}
              />
            </label>
            <RowHowTo row={row} locale={locale} field={field} onChange={(howTo) => setHowTo(row.key, howTo)} />
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" data-action="add" onClick={add} className="inline-flex h-10 items-center border border-border px-4 font-body text-[15px] font-medium text-foreground transition-colors hover:border-signal hover:text-signal disabled:opacity-50">
          {t('add')}
        </button>
        <button
          type="button"
          data-action="approve"
          disabled={pending}
          onClick={approve}
          className="inline-flex h-11 items-center justify-center bg-signal px-5 font-body text-base font-semibold text-signal-foreground transition-colors hover:bg-signal/85 disabled:opacity-50"
        >
          {t('approve')}
        </button>
      </div>

      {notice && <p className="mt-2 font-body text-sm text-muted-foreground">{notice}</p>}
    </section>
  );
}

/**
 * One card's how-to: read-only until the coach chooses to edit it, then each
 * segment's minutes, zone and what to do, and the focus a cue per line. The
 * sum is shown against the session's minutes, since the server refuses a
 * how-to that does not add up.
 */
function RowHowTo({
  row,
  locale,
  field,
  onChange,
}: {
  row: DraftRow;
  locale: Locale;
  field: string;
  onChange: (howTo: HowTo | null) => void;
}) {
  const t = useTranslations('WeekDraftReview');
  const view = howToOfRow(row, locale);
  const label = 'flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground';
  const button = 'inline-flex h-10 items-center border border-border px-4 font-body text-[15px] font-medium text-foreground transition-colors hover:border-signal hover:text-signal';
  const editing = row.coachHowTo;
  const start = () => onChange(startEditing(row, locale));

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3" data-row-how-to>
      <p className="font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">{t('howTo')}</p>
      {row.sport && <p className="font-body text-sm text-foreground">{t('sport', { sport: row.sport })}</p>}
      {row.sportReason && <p className="font-body text-sm text-muted-foreground">{t('sportReason', { reason: row.sportReason })}</p>}
      {view && !editing && <HowToBlock howTo={view} />}
      {editing ? (
        <div className="flex flex-col gap-3">
          {editing.segments.map((segment, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3" data-edit-segment={segment.name}>
              <span className="w-full font-body text-sm font-semibold text-foreground sm:w-28">{segment.name}</span>
              <label className={label}>
                {t('segmentMinutes')}
                <input
                  type="number"
                  min={1}
                  className={`w-20 ${field}`}
                  value={String(segment.minutes)}
                  onChange={(e) => onChange(withSegment(editing, i, 'minutes', e.target.value))}
                />
              </label>
              <label className={label}>
                {t('segmentZone')}
                <input className={`w-16 ${field}`} value={segment.zone} onChange={(e) => onChange(withSegment(editing, i, 'zone', e.target.value))} />
              </label>
              <label className={`${label} min-w-0 flex-1`}>
                {t('segmentDetail')}
                <input className={`w-full ${field}`} value={segment.detail ?? ''} onChange={(e) => onChange(withSegment(editing, i, 'detail', e.target.value))} />
              </label>
            </div>
          ))}
          <p className="font-body text-sm text-muted-foreground" data-how-to-sum>
            {t('howToSum', { sum: segmentMinutes(editing), total: row.durationMinutes || '—' })}
          </p>
          <label className={label}>
            {t('focusLines')}
            <textarea
              className={`w-full field-sizing-content resize-none ${field}`}
              rows={Math.max(editing.focus.length, 1)}
              value={focusText(editing)}
              onChange={(e) => onChange(withFocusText(editing, e.target.value))}
            />
          </label>
          <button type="button" data-action="reset-how-to" onClick={() => onChange(null)} className={`self-start ${button}`}>
            {t('resetHowTo')}
          </button>
        </div>
      ) : (
        view && (
          <button type="button" data-action="edit-how-to" onClick={start} className={`self-start ${button}`}>
            {t('editHowTo')}
          </button>
        )
      )}
    </div>
  );
}
