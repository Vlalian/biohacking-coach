'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { importDetectedFromBlobAction, type UploadFailure } from './garmin-actions';
import { uploadToBlob, type BlobUploadResult } from './garmin-blob-upload';

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading'; fraction: number }
  | { kind: 'done'; count: number }
  | { kind: 'error'; key: string };

/**
 * Failure reason to message key.
 *
 * One message per failure, because one message for all of them is what turns a
 * recoverable mistake into a dead end for a tester who cannot ask
 * (showable-version/06). `unreadable` keeps the generic string on purpose: it is
 * the case where the decoder itself could not say what was wrong.
 *
 * A total map rather than a lookup with a fallback, so adding a reason to
 * `UploadResult` and forgetting the copy is a type error rather than a raw key
 * on screen. Note the guarantee stops there: `Record<UploadFailure, string>`
 * proves every *reason* has an entry, not that every entry names a message that
 * exists — the value type is `string`. Catching a mistyped key would need
 * next-intl's `AppConfig.Messages` augmentation, which this repo does not have;
 * `as const satisfies` alone would not do it. (CodeRabbit, PR #35, correcting
 * its own earlier suggestion on PR #37.)
 */
export const ERROR_KEY: Record<UploadFailure, string> = {
  'not-a-fit-file': 'errorNotAFitFile',
  corrupt: 'errorCorrupt',
  'no-sessions': 'errorNoSessions',
  empty: 'errorEmpty',
  'not-authenticated': 'errorNotAuthenticated',
  unreadable: 'error',
  // A URL outside the athlete's own prefix only comes from a hand-built
  // request; the honest answer to a real athlete is the generic one.
  'not-yours': 'error',
  // The same words the browser shows when it refuses the file itself.
  'too-large': 'errorTooLarge',
};

/** Why the file never reached Blob, to its message. */
const UPLOAD_ERROR_KEY: Record<Exclude<BlobUploadResult, { ok: true }>['reason'], string> = {
  'not-authenticated': 'errorNotAuthenticated',
  empty: 'errorEmpty',
  'too-large': 'errorTooLarge',
  'upload-failed': 'errorUpload',
  // Detection has no lock and one kind; neither can refuse it. Mapped anyway
  // so the map stays total.
  locked: 'error',
  'bad-kind': 'error',
};

/**
 * Upload a Garmin .fit/.gpx file (or a small zip of them) for detection. The
 * file goes straight to Vercel Blob with a progress bar (`garmin-integration/04`
 * — a function body is capped at 4.5 MB), then the server reads it, proposes
 * what it holds and deletes it; on success the calendar revalidates and the
 * proposals appear. A failure names which failure it was — the wrong kind of
 * file and a damaged one need different things from the athlete — and nothing
 * was written in any of those cases.
 */
export function GarminUpload() {
  const t = useTranslations('Garmin');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setStatus({ kind: 'uploading', fraction: 0 });
    const uploaded = await uploadToBlob('detection', [file], (fraction) => setStatus({ kind: 'uploading', fraction }));
    if (inputRef.current) inputRef.current.value = '';
    if (!uploaded.ok) {
      setStatus({ kind: 'error', key: UPLOAD_ERROR_KEY[uploaded.reason] });
      return;
    }

    startTransition(async () => {
      try {
        const result = await importDetectedFromBlobAction(uploaded.urls[0]);
        if (result.ok) {
          setStatus({ kind: 'done', count: result.count });
          router.refresh();
        } else {
          setStatus({ kind: 'error', key: ERROR_KEY[result.reason] });
        }
      } catch {
        setStatus({ kind: 'error', key: 'error' });
      }
    });
  }

  const busy = pending || status.kind === 'uploading';

  return (
    <div className="flex flex-col items-center gap-2">
      {/* relative: anchors the sr-only input inside the scroller, or focusing it
          scrolls the shell frame and the page slides up (showable-version/57). */}
      <label className="relative inline-flex h-10 cursor-pointer items-center gap-2 border border-signal px-4 font-body text-[15px] font-medium text-signal transition-colors hover:bg-signal hover:text-signal-foreground">
        {busy ? t('uploading') : t('upload')}
        <input
          ref={inputRef}
          type="file"
          accept=".fit,.gpx,.zip"
          disabled={busy}
          onChange={(e) => void onFile(e.target.files?.[0])}
          // sr-only, not hidden: visually gone but still focusable, so the
          // picker is reachable by keyboard (a display:none input is not).
          className="sr-only"
        />
      </label>
      {status.kind === 'uploading' && (
        <progress value={status.fraction} max={1} aria-label={t('uploading')} className="block h-1 w-40 accent-signal" />
      )}

      {status.kind === 'done' && (
        <p className="font-body text-sm text-session-recovery">
          {t('imported', { count: status.count })}
        </p>
      )}
      {status.kind === 'error' && (
        <p role="alert" className="font-body text-sm text-destructive">
          {t(status.key)}
        </p>
      )}
    </div>
  );
}
