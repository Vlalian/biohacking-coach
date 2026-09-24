'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import {
  importHistoryAction,
  removeImportedHistoryAction,
  type HistoryFileFailure,
} from './garmin-actions';
import { ERROR_KEY } from './garmin-upload';

type Status =
  | { kind: 'idle' }
  | { kind: 'done'; imported: number; proposed: number; failed: HistoryFileFailure[] }
  | { kind: 'error'; key: string; namespace: 'History' | 'Garmin' };

/**
 * The history upload (`garmin-integration/03`) — the second of the two Garmin
 * buttons. This one writes the athlete's past training straight into the
 * record; the one under the calendar proposes single activities for the
 * athlete to confirm (ballot 1).
 *
 * Many files at once, because the import locks after its first use and a
 * one-file-at-a-time picker would get the athlete one activity. A file that
 * fails is named with its reason and does not stop the rest. Once an import is
 * on file the picker gives way to the count, and — where `allowRemove` is set,
 * which is Settings — to the one way back: remove it all, behind a
 * confirmation, and upload again (ballots 10–11).
 *
 * Onboarding and Settings share the lock. Onboarding does not show the count
 * or the remove; it only calls `onImported`, which submits the step.
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
  const [onFile, setOnFile] = useState({ locked, count: importedCount });
  const [confirming, setConfirming] = useState(false);

  function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatus({ kind: 'idle' });
    const formData = new FormData();
    for (const file of Array.from(files)) formData.append('file', file);

    startTransition(async () => {
      try {
        const result = await importHistoryAction(formData);
        if (inputRef.current) inputRef.current.value = '';
        if (!result.ok) {
          setStatus(
            result.reason === 'locked'
              ? { kind: 'error', key: 'alreadyImported', namespace: 'History' }
              : { kind: 'error', key: ERROR_KEY[result.reason], namespace: 'Garmin' },
          );
          return;
        }
        setStatus({ kind: 'done', ...result });
        const landed = result.imported + result.proposed;
        if (landed > 0) {
          setOnFile({ locked: true, count: result.imported });
          router.refresh();
          onImported?.();
        }
      } catch {
        // A rejected action — an oversized upload, a dropped connection — must
        // not leave the picker spinning. Nothing was written.
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
        setOnFile({ locked: false, count: 0 });
        setConfirming(false);
        setStatus({ kind: 'idle' });
        router.refresh();
      } catch {
        setStatus({ kind: 'error', key: 'error', namespace: 'History' });
      }
    });
  }

  return (
    <div className="space-y-2">
      <span className="font-body text-sm uppercase tracking-[0.16em] text-muted-foreground">{t('title')}</span>
      {onFile.locked ? (
        <p className="font-body text-sm text-foreground">{t('locked', { count: onFile.count })}</p>
      ) : (
        <>
          <p className="font-body text-[13px] text-muted-foreground">{t('help')}</p>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 border border-signal px-4 font-body text-base font-semibold text-signal transition-colors hover:bg-signal hover:text-signal-foreground">
            {pending && <Loader2 className="h-3 w-3 animate-spin" />}
            {pending ? t('uploading') : t('choose')}
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".fit,.gpx"
              disabled={pending}
              onChange={(e) => upload(e.target.files)}
              // sr-only, not hidden: still focusable, so the picker is reachable by keyboard.
              className="sr-only"
            />
          </label>
        </>
      )}

      {status.kind === 'done' && (
        <p className="font-body text-sm text-session-recovery">
          {t('result', { imported: status.imported, proposed: status.proposed })}
        </p>
      )}
      {status.kind === 'done' &&
        status.failed.map((f, i) => (
          <p key={`${f.name}-${i}`} role="alert" className="font-body text-sm text-destructive">
            <span className="font-semibold">{f.name}</span> — {tGarmin(ERROR_KEY[f.reason])}
          </p>
        ))}
      {status.kind === 'error' && (
        <p role="alert" className="font-body text-sm text-destructive">
          {status.namespace === 'History' ? t(status.key) : tGarmin(status.key)}
        </p>
      )}

      {allowRemove && onFile.locked && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="font-body text-sm uppercase tracking-[0.16em] text-destructive transition-opacity hover:opacity-80"
        >
          {t('remove')}
        </button>
      )}
      {allowRemove && onFile.locked && confirming && (
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
