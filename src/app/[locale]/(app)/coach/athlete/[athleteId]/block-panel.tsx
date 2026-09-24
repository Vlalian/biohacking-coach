'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { addDays } from '@/lib/date';
import type { BlockAuthor, TrainingBlockSpec } from '@/features/coach/training-blocks';
import { editBlockAction, type EditBlockActionResult } from './block-actions';

/**
 * The Head Coach's Training Block editor (`training-architecture/08`): one row
 * per block — an inline name, a plain date input for the end, the author — and
 * the same one-line read the athlete gets above their calendar.
 *
 * Rename and re-boundary only. There is deliberately no add and no remove: the
 * panel is the shape of the authority, and a button here would widen it. The
 * last block's end is race day and its input is disabled with a word saying
 * why. Each submit sends the set's `version`; a `conflict` result re-renders
 * the rows from what won, so the coach edits what is actually there next.
 *
 * The server is the authority: this sends what to change, never who, and the
 * action re-resolves the Head Coach from the session.
 */

export interface BlockPanelSet {
  raceId: string;
  raceName: string;
  raceDate: string;
  version: number;
  /** The stored set no longer ends on race day — the rows are the arithmetic draft, not the set. */
  stale: boolean;
  startDate: string;
  blocks: TrainingBlockSpec[];
}

type Row = { name: string; endDate: string };

/**
 * What the panel believes once a save has landed: the edited row as the coach
 * typed it, authored by them, and the version the server just returned.
 *
 * Pure and exported for its test. The panel keeps the set in state, and
 * `router.refresh()` re-renders the page without resetting that state — so
 * without this, the second save in one visit re-sent the version of the first
 * render and was refused as a conflict the coach did not cause (review of 08,
 * 2026-09-15).
 */
export function afterSave(set: BlockPanelSet, position: number, row: Row, version: number): BlockPanelSet {
  return {
    ...set,
    version,
    blocks: set.blocks.map((b, i) =>
      i === position - 1 ? { name: row.name.trim(), endDate: row.endDate, authoredBy: 'head_coach' } : b,
    ),
  };
}

const AUTHOR_KEY: Record<BlockAuthor, 'authorDraft' | 'authorCoach' | 'authorYou'> = {
  arithmetic: 'authorDraft',
  coach_ai: 'authorCoach',
  head_coach: 'authorYou',
};

export function BlockPanel({ athleteId, set }: { athleteId: string; set: BlockPanelSet | null }) {
  const t = useTranslations('BlockPanel');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState<BlockPanelSet | null>(set);
  const [rows, setRows] = useState<Row[]>(set ? set.blocks.map(({ name, endDate }) => ({ name, endDate })) : []);
  const [notice, setNotice] = useState<string | null>(null);

  if (!current) return null;

  const submit = (position: number) => {
    const row = rows[position - 1];
    const was = current.blocks[position - 1];
    const input = {
      ...(row.name.trim() !== was.name ? { name: row.name } : {}),
      ...(row.endDate !== was.endDate ? { endDate: row.endDate } : {}),
    };
    startTransition(async () => {
      setNotice(null);
      const result: EditBlockActionResult = await editBlockAction(
        athleteId,
        current.raceId,
        position,
        input,
        current.version,
      );
      if (result.ok) {
        setCurrent(afterSave(current, position, row, result.version));
        router.refresh();
        return;
      }
      if (result.reason === 'conflict') {
        const won = { ...current, ...result.current };
        setCurrent(won);
        setRows(won.blocks.map(({ name, endDate }) => ({ name, endDate })));
        setNotice(t('conflict'));
        return;
      }
      setNotice(t('error', { reason: result.reason === 'invalid' ? result.problem : result.reason }));
    });
  };

  const last = current.blocks.length - 1;

  return (
    <section className="w-full max-w-3xl border border-border bg-panel p-5 shadow-sm sm:p-6" data-version={current.version}>
      <h2 className="mb-1 font-display text-2xl font-bold uppercase italic tracking-[0.03em] text-foreground">{t('title')}</h2>
      <p className="mb-3 font-body text-sm uppercase tracking-[0.18em] text-muted-foreground">
        {t('toward', { race: current.raceName, date: current.raceDate })}
      </p>

      {current.stale && (
        // The race moved and the stored set no longer fits it. What is shown is
        // the arithmetic draft; what an edit would land on is the old set. No
        // inputs, no save — the Coach redraws it on the next background run.
        <p className="mb-3 font-body text-sm text-warning">{t('stale')}</p>
      )}

      {current.stale ? (
        <ol className="flex flex-col gap-1">
          {current.blocks.map((block, i) => (
            <li key={i + 1} className="flex items-baseline justify-between gap-3 font-body text-base">
              <span>{block.name}</span>
              <span className="font-mono text-sm text-muted-foreground">{block.endDate}</span>
            </li>
          ))}
        </ol>
      ) : (
      <ol className="flex flex-col gap-2">
        {current.blocks.map((block, i) => {
          const position = i + 1;
          const previousEnd = i === 0 ? addDays(current.startDate, -1) : current.blocks[i - 1].endDate;
          const isLast = i === last;
          return (
            <li key={position} className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-3">
              <label className="flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
                {t('name')}
                <input
                  className="h-11 border border-border bg-background px-3 font-body text-base normal-case tracking-normal text-foreground outline-none focus:border-signal"
                  value={rows[i].name}
                  maxLength={40}
                  onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
              </label>
              <label className="flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
                {t('endsOn')}
                <input
                  type="date"
                  className="h-11 border border-border bg-background px-3 font-body text-base normal-case tracking-normal text-foreground outline-none focus:border-signal disabled:opacity-50"
                  value={rows[i].endDate}
                  min={addDays(previousEnd, 1)}
                  max={isLast ? current.raceDate : addDays(current.blocks[i + 1].endDate, -1)}
                  disabled={isLast}
                  aria-describedby={isLast ? `block-${position}-race-day` : undefined}
                  onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, endDate: e.target.value } : x)))}
                />
                {isLast && (
                  <span id={`block-${position}-race-day`} className="text-muted-foreground">
                    {t('endsOnRaceDay')}
                  </span>
                )}
              </label>
              <span className="pb-1 font-body text-sm uppercase tracking-[0.16em] text-muted-foreground">
                {t(AUTHOR_KEY[block.authoredBy])}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => submit(position)}
                className="inline-flex h-11 items-center justify-center bg-signal px-5 font-body text-base font-semibold text-signal-foreground transition-colors hover:bg-signal/85 disabled:opacity-50"
              >
                {t('save')}
              </button>
            </li>
          );
        })}
      </ol>
      )}

      {notice && <p className="mt-2 font-body text-sm text-destructive">{notice}</p>}
    </section>
  );
}
