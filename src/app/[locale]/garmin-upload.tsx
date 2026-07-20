'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { uploadGarminAction } from './garmin-actions';

type Status =
  | { kind: 'idle' }
  | { kind: 'done'; count: number }
  | { kind: 'error' };

/**
 * Upload a Garmin .fit/.gpx file. The file goes straight to the server action,
 * which parses and persists it; on success the calendar revalidates and the new
 * session appears. Failures (a malformed file, an empty pick) surface as one
 * generic localized message — nothing was written.
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
        setStatus({ kind: 'error' });
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <label className="cursor-pointer rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
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
        <p className="text-sm text-green-700 dark:text-green-500">
          {t('imported', { count: status.count })}
        </p>
      )}
      {status.kind === 'error' && (
        <p role="alert" className="text-sm text-red-600">
          {t('error')}
        </p>
      )}
    </div>
  );
}
