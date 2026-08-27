'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { PendingActivity } from '@/features/garmin/detected-activity';
import { formatFullDate } from '@/lib/date';
import { ScoreRow } from './rating-modal';
import { acceptDetectedActivityAction, declineDetectedActivityAction } from './garmin-actions';

/**
 * The Detected Activities waiting for the athlete — the human that
 * `CONTEXT.md` requires between detection and the frozen training log.
 *
 * Everything here is still a proposal. Nothing in this list has touched the
 * calendar, which is what lets Discard be a plain button with no consequences
 * to explain: it removes a row from a table the training record does not read.
 * Accepting is the Session Reflection itself, not a step before it, so each
 * card carries the RPE rows rather than a confirm button that opens them.
 *
 * Renders nothing when there is nothing pending, so the Training Plan is
 * unchanged for an athlete who has never uploaded.
 */
export function DetectedActivities({
  activities,
  locale,
}: {
  activities: PendingActivity[];
  locale: string;
}) {
  if (activities.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      {activities.map((activity) => (
        <ActivityCard key={activity.id} activity={activity} locale={locale} />
      ))}
    </section>
  );
}

function ActivityCard({ activity, locale }: { activity: PendingActivity; locale: string }) {
  const t = useTranslations('Detected');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState(0);
  const [mind, setMind] = useState(0);
  const [comment, setComment] = useState('');
  const [failed, setFailed] = useState(false);

  function run(action: () => Promise<{ ok: boolean }>) {
    setFailed(false);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setFailed(true);
    });
  }

  const minutes = activity.duration === null ? null : Math.round(activity.duration / 60);

  return (
    <article className="flex flex-col gap-4 border border-signal/40 bg-panel p-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal">
          {t('label')}
        </p>
        <h3 className="mt-1 font-display text-xl tracking-[0.04em] text-foreground">
          {activity.sport ?? activity.type}
          {minutes !== null && ` · ${minutes} ${t('minutes')}`}
        </h3>
        <p className="mt-0.5 font-body text-sm text-muted-foreground">
          {formatFullDate(activity.date, locale)}
        </p>
        {/* What accepting would do, said plainly — the two cases differ enough
            that one generic "add this?" would mislead on a Double day. */}
        <p className="mt-2 font-body text-sm text-foreground">
          {activity.matchedSessionId ? t('willComplete') : t('willAdd')}
        </p>
      </div>

      <ScoreRow label={t('body')} value={body} onPick={setBody} />
      <ScoreRow label={t('mind')} value={mind} onPick={setMind} />

      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('comment')}
        </span>
        <textarea
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="resize-none border border-border bg-background p-2 font-body text-sm text-foreground outline-none focus:border-signal"
        />
      </label>

      {failed && (
        <p role="alert" className="font-body text-sm text-destructive">
          {t('error')}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          // The rating is the commit, so there is nothing to accept without it.
          disabled={pending || body < 1 || mind < 1}
          onClick={() =>
            run(() =>
              acceptDetectedActivityAction(activity.id, {
                body,
                mind,
                comment: comment || null,
              }),
            )
          }
          className="flex-1 border border-signal bg-signal px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-background disabled:opacity-40"
        >
          {t('accept')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => declineDetectedActivityAction(activity.id))}
          className="border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground disabled:opacity-40"
        >
          {t('discard')}
        </button>
      </div>
    </article>
  );
}
