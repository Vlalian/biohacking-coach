'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { uploadGarminAction, type UploadFailure } from './garmin-actions';

type Status =
  | { kind: 'idle' }
  | { kind: 'done'; count: number }
  | { kind: 'error'; reason: UploadFailure };

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
};

/**
 * Upload a Garmin .fit/.gpx file. The file goes straight to the server action,
 * which parses and persists it; on success the calendar revalidates and the new
 * session appears. A failure names which failure it was — the wrong kind of file
 * and a damaged one need different things from the athlete — and nothing was
 * written in any of those cases.
 */
export function GarminUpload() {
  const t = useTranslations('Garmin');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  function onFile(file: File | undefined) {
    if (!file) return;
    setStatus({ kind: 'idle' });
    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const result = await uploadGarminAction(formData);
      if (inputRef.current) inputRef.current.value = '';
      if (result.ok) {
        setStatus({ kind: 'done', count: result.count });
        router.refresh();
      } else {
        setStatus({ kind: 'error', reason: result.reason });
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <label className="inline-flex h-10 cursor-pointer items-center gap-2 border border-signal px-4 font-body text-[15px] font-medium text-signal transition-colors hover:bg-signal hover:text-signal-foreground">
        {pending ? t('uploading') : t('upload')}
        <input
          ref={inputRef}
          type="file"
          accept=".fit,.gpx"
          disabled={pending}
          onChange={(e) => onFile(e.target.files?.[0])}
          // sr-only, not hidden: visually gone but still focusable, so the
          // picker is reachable by keyboard (a display:none input is not).
          className="sr-only"
        />
      </label>

      {status.kind === 'done' && (
        <p className="font-body text-sm text-session-recovery">
          {t('imported', { count: status.count })}
        </p>
      )}
      {status.kind === 'error' && (
        <p role="alert" className="font-body text-sm text-destructive">
          {t(ERROR_KEY[status.reason])}
        </p>
      )}
    </div>
  );
}
