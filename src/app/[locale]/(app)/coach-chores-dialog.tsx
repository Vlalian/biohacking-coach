'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import type { BlockRepinChore, BlockSetRepair, CoachChore } from '@/features/coach/coach-chores';
import {
  repinBlockSetAction,
  restartBlockSetAction,
  type RepinBlockSetActionResult,
} from './coach/athlete/[athleteId]/block-actions';

/**
 * The Head Coach's chores, as a dialog before the page
 * (`training-architecture/19`, ruling 3: *"the repair must cost the Head Coach
 * one click and find them, not wait to be found"*).
 *
 * One row per stale set — whose race, where it moved from and to, which block
 * still ends where — with one primary button: **Re-pin to {date}**, or **Start
 * over from the draft** when the race moved so early that fewer than two
 * blocks would survive, and the row says why. **Re-pin all** runs every row.
 * **Not now** hides the dialog for this browser session only: the flag lives
 * in `sessionStorage`, so it is gone with the tab and the dialog returns on
 * the next login until every row is done. Nothing about the dismissal is
 * stored server-side — it is not a decision, it is a postponement.
 *
 * The rows are a list of chores with one kind today (triage, 2026-09-17).
 * The server is the authority: each click sends the athlete, the race and the
 * version the row was built from; the action re-resolves the coach from the
 * session and refuses a set that changed underneath with what won.
 */

const DISMISSED_KEY = 'bc.coachChoresDismissed';

/** What one row is showing right now. */
export type RowState =
  | { kind: 'idle'; repair: BlockSetRepair }
  | { kind: 'pending'; repair: BlockSetRepair }
  | { kind: 'done' }
  | { kind: 'error'; reason: string; repair: BlockSetRepair };

/**
 * The row after the server answered — pure, so the copy rules are testable
 * without a click. A re-pin refused for too few survivors becomes the draft
 * offer, with what would go: the race moved again since the row was built. A
 * set that is no longer stale, or gone, is a row with nothing left to do.
 * Anything else — a conflict, a severed link — is an error naming its reason,
 * with the same button underneath so the coach can try again after the
 * refresh the conflict triggers.
 */
export function rowAfterResult(repair: BlockSetRepair, result: RepinBlockSetActionResult): RowState {
  if (result.ok) return { kind: 'done' };
  if (result.reason === 'too-few-blocks') {
    return { kind: 'idle', repair: { kind: 'restart', dropped: result.dropped } };
  }
  if (result.reason === 'not-stale' || result.reason === 'no-set') return { kind: 'done' };
  return { kind: 'error', reason: result.reason, repair };
}

/** Whether a row still has a button to press. */
export function isOpen(row: RowState): row is Extract<RowState, { kind: 'idle' | 'error' }> {
  return row.kind === 'idle' || row.kind === 'error';
}

const NEVER_CHANGES = () => () => {};

/** What a row is keyed by: the set, not its position in a list that a refresh can reorder or shrink. */
export function choreKey(chore: Pick<CoachChore, 'athleteId' | 'raceId'>): string {
  return `${chore.athleteId}:${chore.raceId}`;
}

/** A chore's row, or its idle row when nothing has happened to it yet. */
export function rowFor(rows: Readonly<Record<string, RowState>>, chore: CoachChore): RowState {
  return rows[choreKey(chore)] ?? { kind: 'idle', repair: chore.repair };
}

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // A blocked store means the dialog returns on the next navigation; the
    // postponement is a convenience, not state anything depends on.
  }
}

/**
 * The dialog, hydration-safe: the server snapshot says "dismissed", so the
 * markup the page arrives with carries no dialog and the first client render
 * agrees with it; the real answer — the session flag — arrives when React
 * switches to the client snapshot. The cost is that the dialog appears one
 * tick after hydration rather than in the HTML; the alternative was a
 * hydration mismatch on every Head Coach's login.
 */
export function CoachChoresDialog({ chores }: { chores: CoachChore[] }) {
  const dismissed = useSyncExternalStore(NEVER_CHANGES, readDismissed, () => true);
  const [hidden, setHidden] = useState(false);
  const hide = useCallback(() => setHidden(true), []);
  if (chores.length === 0 || dismissed || hidden) return null;
  return <CoachChoresDialogView chores={chores} onClose={hide} />;
}

/** The dialog's markup and behaviour, rendered whenever the wrapper says so. Exported for its test. */
export function CoachChoresDialogView({ chores, onClose }: { chores: CoachChore[]; onClose: () => void }) {
  const t = useTranslations('CoachChores');
  const format = useFormatter();
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Keyed by the set, not by index: a conflict refreshes `chores` from the
  // server, and the list may have shrunk or reordered under the rows that
  // already exist. A row must stay with its athlete.
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const current = chores.map((c) => rowFor(rows, c));

  const allDone = current.every((r) => r.kind === 'done');
  const anyDone = current.some((r) => r.kind === 'done');
  const anyOpen = current.some(isOpen);
  const anyPending = current.some((r) => r.kind === 'pending');

  // "Not now" is a postponement and is remembered for the session; closing a
  // dialog with nothing left in it is not, and must not hide the next chore.
  // Either way a repair that landed is shown on the page behind: the coach's
  // pages were revalidated by the action, the shell re-reads on refresh.
  // Stable across renders (the focus hook re-runs on a new callback, and
  // would re-focus the panel under a button mid-click); the flags it reads
  // are the latest through a ref, synced after each render.
  const latest = useRef({ allDone, anyDone });
  useEffect(() => {
    latest.current = { allDone, anyDone };
  });
  const dismiss = useCallback(() => {
    if (!latest.current.allDone) writeDismissed();
    if (latest.current.anyDone) router.refresh();
    onClose();
  }, [onClose, router]);
  const panelRef = useDialogFocus(dismiss);

  const day = (key: string) =>
    format.dateTime(new Date(`${key}T12:00:00Z`), { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const settle = (chore: CoachChore, row: RowState) => setRows((rs) => ({ ...rs, [choreKey(chore)]: row }));

  async function repair(chore: BlockRepinChore, repairWith: BlockSetRepair) {
    settle(chore, { kind: 'pending', repair: repairWith });
    const act = repairWith.kind === 'repin' ? repinBlockSetAction : restartBlockSetAction;
    const result = await act(chore.athleteId, chore.raceId, chore.version);
    settle(chore, rowAfterResult(repairWith, result));
    // What won is on the server; the next render builds the row from it.
    if (!result.ok && result.reason === 'conflict') router.refresh();
  }

  const runRow = (chore: BlockRepinChore) => {
    const row = rowFor(rows, chore);
    if (!isOpen(row)) return;
    startTransition(() => repair(chore, row.repair));
  };

  const runAll = () => {
    startTransition(async () => {
      for (const chore of chores) {
        const row = rowFor(rows, chore);
        if (isOpen(row)) await repair(chore, row.repair);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coach-chores-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-[1px]"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex w-full max-w-lg flex-col gap-4 border border-border bg-panel p-6 shadow-2xl outline-none"
      >
        <div>
          <p className="font-body text-sm uppercase tracking-[0.24em] text-signal">{t('kicker')}</p>
          <h2 id="coach-chores-title" className="text-lg font-semibold">
            {t('title', { count: chores.length })}
          </h2>
        </div>

        <ol className="flex flex-col gap-4">
          {chores.map((chore) => {
            const row = rowFor(rows, chore);
            return (
              <li key={choreKey(chore)} className="flex flex-col gap-2 text-sm" data-state={row.kind}>
                <p>
                  {t('moved', {
                    athlete: chore.athleteName,
                    race: chore.raceName,
                    from: day(chore.lastBlockEnd),
                    to: day(chore.raceDate),
                  })}{' '}
                  {t('stillEnds', { block: chore.lastBlockName, day: day(chore.lastBlockEnd) })}
                </p>
                {row.kind !== 'done' && row.repair.kind === 'restart' && (
                  <p className="text-muted-foreground">
                    {t('tooFew', { dropped: row.repair.dropped.join(' · ') || t('nothing') })}
                  </p>
                )}
                {row.kind === 'error' && <p className="text-red-600">{t('error', { reason: row.reason })}</p>}
                {row.kind === 'done' ? (
                  <p className="text-muted-foreground">{t('done')}</p>
                ) : (
                  <button
                    type="button"
                    disabled={row.kind === 'pending'}
                    onClick={() => runRow(chore)}
                    className="self-start rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                  >
                    {row.repair.kind === 'repin' ? t('repin', { day: day(chore.raceDate) }) : t('restart')}
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="rounded px-3 py-1 text-sm text-muted-foreground hover:text-signal"
          >
            {allDone ? t('close') : t('notNow')}
          </button>
          {anyOpen && chores.length > 1 && (
            <button
              type="button"
              disabled={anyPending}
              onClick={runAll}
              className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
            >
              {t('repinAll')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
