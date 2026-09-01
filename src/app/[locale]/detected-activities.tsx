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
        <DetectedActivityCard key={activity.id} activity={activity} locale={locale} />
      ))}
    </section>
  );
}

function DetectedActivityCard({ activity, locale }: { activity: PendingActivity; locale: string }) {
  const t = useTranslations('Detected');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState(0);
  const [mind, setMind] = useState(0);
  const [comment, setComment] = useState('');
  const [failed, setFailed] = useState(false);
  // Pre-selected with the matcher's suggestion — a suggestion, not a verdict.
  const [target, setTarget] = useState<string | null>(activity.suggestedSessionId);

  // What the athlete reads on each choice. A Planned Session has no clock time
  // to name it by, so on a Double day two of them can be word-for-word
  // identical — same type, same duration, same zone — and picking between two
  // identical labels is the coin flip this card exists to remove.
  //
  // So an ordinal is added, but ONLY to the ones that actually collide. Putting
  // "Session 1" on every choice would label the ordinary single-session day
  // with a number that distinguishes nothing.
  const labelFor = (option: PendingActivity['options'][number]) =>
    [option.type, option.duration !== null && `${option.duration} ${t('minutes')}`, option.zone]
      .filter(Boolean)
      .join(' · ');

  const labels = activity.options.map(labelFor);
  const ambiguous = new Set(labels.filter((label, i) => labels.indexOf(label) !== i));

  // Rank by dayOrder rather than using it directly: it orders the day but is
  // not promised to be 1-based or contiguous, and the number shown to the
  // athlete should read as "the first one" rather than as a database value.
  const rank = [...activity.options]
    .sort((a, b) => a.dayOrder - b.dayOrder)
    .map((option) => option.id);

  function run(action: () => Promise<{ ok: boolean }>) {
    setFailed(false);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setFailed(true);
    });
  }

  return (
    <article className="flex flex-col gap-4 border border-signal/40 bg-panel p-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal">
          {t('label')}
        </p>
        <h3 className="mt-1 font-display text-xl tracking-[0.04em] text-foreground">
          {activity.sport ?? activity.type}
          {/* `duration` is already minutes — `garmin.ts` divides the file's
              elapsed seconds by 60 at parse time, as `sessions.duration` is
              minutes everywhere else in the app. */}
          {activity.duration !== null && ` · ${activity.duration} ${t('minutes')}`}
        </h3>
        <p className="mt-0.5 font-body text-sm text-muted-foreground">
          {formatFullDate(activity.date, locale)}
        </p>
      </div>

      {/* Which session this was, chosen by the athlete rather than decided for
          them. The matcher cannot tell a morning swim from an evening ride —
          `SPORT_MAP` types both as Endurance — and an in-place completion is
          not something the ordinary controls can walk back. Skipped and
          displaced sessions are offered too: the athlete is allowed to say
          they did it after all, and the file is their evidence. */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('whichSession')}
        </legend>
        {activity.options.map((option) => (
          <TargetChoice
            key={option.id}
            name={`target-${activity.id}`}
            checked={target === option.id}
            onPick={() => setTarget(option.id)}
            /* No time of day to name it by: a Planned Session carries a date
               and an order, never a clock time. */
            label={
              ambiguous.has(labelFor(option))
                ? `${t('ordinal', { n: rank.indexOf(option.id) + 1 })} · ${labelFor(option)}`
                : labelFor(option)
            }
            note={option.status !== 'planned' ? t(`status.${option.status}`) : null}
          />
        ))}
        <TargetChoice
          name={`target-${activity.id}`}
          checked={target === null}
          onPick={() => setTarget(null)}
          label={t('addAsNew')}
          note={null}
        />
      </fieldset>

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
              acceptDetectedActivityAction(activity.id, target, {
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

/** One row of the "which session was this?" choice. */
function TargetChoice({
  name,
  checked,
  onPick,
  label,
  note,
}: {
  name: string;
  checked: boolean;
  onPick: () => void;
  label: string;
  note: string | null;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 border border-border p-2 font-body text-sm text-foreground has-[:checked]:border-signal">
      <input type="radio" name={name} checked={checked} onChange={onPick} className="accent-signal" />
      <span>{label}</span>
      {note && (
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {note}
        </span>
      )}
    </label>
  );
}
