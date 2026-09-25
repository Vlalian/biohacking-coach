'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { HISTORY_WINDOW_WEEKS, importRunning, type ImportSummary } from '@/features/garmin/blob-upload';
import { historyImportStatusAction, removeImportedHistoryAction, startHistoryImportAction } from './garmin-actions';
import { uploadToBlob, type BlobUploadResult } from './garmin-blob-upload';
import { ERROR_KEY } from './garmin-upload';

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading'; fraction: number }
  | { kind: 'uploaded'; urls: string[] }
  | { kind: 'error'; key: string; namespace: 'History' | 'Garmin' };

/** How often the screen asks how far the import has got. */
const POLL_MS = 2000;

/** Upload failures to their message, in the namespace that holds it. */
const UPLOAD_ERROR: Record<Exclude<BlobUploadResult, { ok: true }>['reason'], { key: string; namespace: 'History' | 'Garmin' }> = {
  'not-authenticated': { key: ERROR_KEY['not-authenticated'], namespace: 'Garmin' },
  empty: { key: ERROR_KEY.empty, namespace: 'Garmin' },
  locked: { key: 'alreadyImported', namespace: 'History' },
  'bad-kind': { key: 'error', namespace: 'History' },
  'too-large': { key: 'tooLarge', namespace: 'History' },
  'upload-failed': { key: 'uploadFailed', namespace: 'History' },
};

/**
 * The history upload (`garmin-integration/03`, `04`) — the second of the two
 * Garmin buttons. This one writes the athlete's past training straight into
 * the record; the one under the calendar proposes single activities for the
 * athlete to confirm (ballot 1).
 *
 * Since `04` the files go straight to Vercel Blob with a progress bar, then
 * *Import* takes the lock and the server reads them in the background, keeping
 * only the last eight weeks. The screen polls for progress and picks the poll
 * up again when the athlete comes back, so leaving the page loses nothing.
 * Once an import is on file the picker gives way to the count, and — where
 * `allowRemove` is set, which is Settings — to the one way back: remove it all,
 * behind a confirmation, and upload again (ballots 10–11).
 *
 * Onboarding and Settings share the lock. Onboarding does not show the count
 * or the remove; it calls `onImported` as soon as the import has started.
 */
export function HistoryUpload({
  locked,
  importedCount,
  allowRemove,
  onImported,
}: {
  locked: boolean;
  importedCount: number;
  allowRemove: boolean;
  onImported?: () => void;
}) {
  const t = useTranslations('History');
  const tGarmin = useTranslations('Garmin');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // The lock as this screen last saw it: taken the moment Import succeeds,
  // released by the remove, without waiting for the page to refresh.
  const [lockedNow, setLockedNow] = useState(locked);
  const [progress, setProgress] = useState<ImportSummary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const importing = progress !== null && importRunning(progress.status);

  // A locked history asks once where its import stands — the athlete may have
  // left while it ran, and this is how the progress comes back.
  useEffect(() => {
    if (!lockedNow) return;
    let cancelled = false;
    historyImportStatusAction()
      .then((result) => {
        if (!cancelled && result.ok && result.summary) setProgress(result.summary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lockedNow]);

  // While it runs, poll; when it stops, refresh so the count beside the lock is current.
  useEffect(() => {
    if (!importing) return;
    const timer = setInterval(async () => {
      const result = await historyImportStatusAction().catch(() => null);
      if (!result?.ok || !result.summary) return;
      setProgress(result.summary);
      if (!importRunning(result.summary.status)) router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [importing, router]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus({ kind: 'uploading', fraction: 0 });
    const result = await uploadToBlob('history', Array.from(files), (fraction) => setStatus({ kind: 'uploading', fraction }));
    if (inputRef.current) inputRef.current.value = '';
    setStatus(result.ok ? { kind: 'uploaded', urls: result.urls } : { kind: 'error', ...UPLOAD_ERROR[result.reason] });
  }

  function startImport(urls: string[]) {
    startTransition(async () => {
      try {
        const result = await startHistoryImportAction(urls);
        if (!result.ok) {
          setStatus(
            result.reason === 'locked'
              ? { kind: 'error', key: 'alreadyImported', namespace: 'History' }
              : { kind: 'error', key: ERROR_KEY[result.reason], namespace: 'Garmin' },
          );
          return;
        }
        setStatus({ kind: 'idle' });
        setProgress({ status: 'unpacking', total: 0, done: 0, skippedOld: 0, failed: 0 });
        setLockedNow(true);
        onImported?.();
      } catch {
        setStatus({ kind: 'error', key: 'error', namespace: 'History' });
      }
    });
  }

  function remove() {
    startTransition(async () => {
      try {
        const result = await removeImportedHistoryAction();
        if (!result.ok) {
          setStatus({ kind: 'error', key: ERROR_KEY[result.reason], namespace: 'Garmin' });
          return;
        }
        setLockedNow(false);
        setProgress(null);
        setConfirming(false);
        setStatus({ kind: 'idle' });
        router.refresh();
      } catch {
        setStatus({ kind: 'error', key: 'error', namespace: 'History' });
      }
    });
  }

  const uploading = status.kind === 'uploading';

  return (
    <div className="space-y-2">
      <span className="font-body text-sm uppercase tracking-[0.16em] text-muted-foreground">{t('title')}</span>
      {lockedNow ? (
        <>
          {!importing && <p className="font-body text-sm text-foreground">{t('locked', { count: importedCount })}</p>}
          {progress && <HistoryImportProgress status={progress} />}
        </>
      ) : status.kind === 'uploaded' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-body text-sm text-foreground">{t('uploaded', { count: status.urls.length })}</p>
          <button
            type="button"
            onClick={() => startImport(status.urls)}
            disabled={pending}
            className="inline-flex h-11 items-center gap-2 border border-signal px-4 font-body text-base font-semibold text-signal transition-colors hover:bg-signal hover:text-signal-foreground disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            {t('import')}
          </button>
        </div>
      ) : (
        <>
          <p className="font-body text-[13px] text-muted-foreground">{t('help', { weeks: HISTORY_WINDOW_WEEKS })}</p>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 border border-signal px-4 font-body text-base font-semibold text-signal transition-colors hover:bg-signal hover:text-signal-foreground">
            {uploading && <Loader2 className="h-3 w-3 animate-spin" />}
            {uploading ? t('uploading', { percent: Math.round(status.fraction * 100) }) : t('choose')}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".fit,.gpx,.zip"
              disabled={uploading}
              onChange={(e) => void upload(e.target.files)}
              // sr-only, not hidden: still focusable, so the picker is reachable by keyboard.
              className="sr-only"
            />
          </label>
          {uploading && (
            <progress
              value={status.fraction}
              max={1}
              aria-label={t('uploading', { percent: Math.round(status.fraction * 100) })}
              className="block h-1 w-full max-w-xs accent-signal"
            />
          )}
        </>
      )}

      {status.kind === 'error' && (
        <p role="alert" className="font-body text-sm text-destructive">
          {status.namespace === 'History' ? t(status.key) : tGarmin(status.key)}
        </p>
      )}

      {allowRemove && lockedNow && !importing && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="font-body text-sm uppercase tracking-[0.16em] text-destructive transition-opacity hover:opacity-80"
        >
          {t('remove')}
        </button>
      )}
      {allowRemove && lockedNow && !importing && confirming && (
        <div className="border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-body text-sm text-foreground">{t('removeConfirmTitle')}</p>
          <p className="mt-1 font-body text-[13px] text-muted-foreground">{t('removeConfirmBody')}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex items-center gap-2 border border-destructive h-11 px-4 font-body text-base font-semibold text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
            >
              {pending && <Loader2 className="h-3 w-3 animate-spin" />}
              {t('removeConfirm')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="border border-border h-11 px-4 font-body text-base font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('removeCancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * How far an import has got: "Unpacking…" while the export is opened, then
 * "Importing 340 of 1 200", then how many activities were older than the
 * window and how many files would not read.
 * A live region, so a screen reader hears it move.
 */
export function HistoryImportProgress({ status }: { status: ImportSummary }) {
  const t = useTranslations('History');
  const running = importRunning(status.status);
  return (
    <div role="status" className="space-y-1 font-body text-sm">
      <p className={running ? 'text-foreground' : 'text-session-recovery'}>
        {running && <Loader2 className="mr-2 inline h-3 w-3 animate-spin" />}
        {status.status === 'unpacking'
          ? t('unpacking')
          : running
            ? t('importing', { done: status.done, total: status.total })
            : t('imported', { done: status.done })}
      </p>
      {status.skippedOld > 0 && (
        <p className="text-muted-foreground">{t('skippedOld', { count: status.skippedOld, weeks: HISTORY_WINDOW_WEEKS })}</p>
      )}
      {status.failed > 0 && <p className="text-destructive">{t('failedFiles', { count: status.failed })}</p>}
    </div>
  );
}
