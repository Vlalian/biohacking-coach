'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import type { CheckInReport } from '@/features/coach/check-in-repository';

/** What the athlete reports — three scores together, and a sentence or nothing — declared with its store. */
export type { CheckInReport };

/** One 1–10 score, as a row of ten buttons. */
function ScoreRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (score: number) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
          <button
            key={score}
            type="button"
            disabled={disabled}
            aria-pressed={value === score}
            onClick={() => onChange(score)}
            className={`h-8 w-8 border font-mono text-[11px] transition-colors disabled:opacity-40 ${
              value === score
                ? 'border-signal bg-signal text-signal-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The Check-in: how the athlete arrives at the week.
 *
 * Its own component since `training-architecture/21`: the Weekly Session that
 * used to open with it is retired, and the Coach Overlay's reminder on the
 * Weekly Session Day opens this instead. The form and its submit path are the
 * ones the session had; only the host changed.
 *
 * Three scores and a sentence. The three are required *together* — half a
 * Check-in renders to the Coach as none at all, which is why Save stays
 * disabled until all three are answered rather than filing what it has.
 *
 * The sentence is optional and deliberately free text: how a week actually went
 * is not a number, and it is the only part of this the athlete writes in their
 * own words.
 *
 * It **reaches the Coach prompt verbatim**, which is why the field carries its
 * own warning. ADR 0011 keeps an Injury's detail thread away from the model;
 * this field is not that thread, and Mads ruled on 2026-09-10 that it stays as
 * the athlete's own account of their training week (the athlete already types
 * freely into Coach Chat, which is replayed on every later turn). The label does
 * the steering: how training felt, not medical detail.
 *
 * Read against the athlete's own baseline, never an absolute scale and never
 * another athlete — someone who always says 6 and today says 4 has told the
 * Coach something real, and a constant bias cancels in a within-athlete
 * comparison. That is what makes a self-reported Check-in trustworthy enough to
 * be a current-form input at all.
 *
 * Skippable, and that is not a concession: the Check-in is offered, never
 * forced (ADR 0007), so an athlete who does not want to answer still gets their
 * week — the prompt simply says it has no report from them.
 */
export function CheckInStep({
  pending,
  onSubmit,
  onSkip,
}: {
  pending: boolean;
  onSubmit: (report: CheckInReport) => void;
  onSkip: () => void;
}) {
  const t = useTranslations('CheckIn');
  const [energy, setEnergy] = useState<number | null>(null);
  const [body, setBody] = useState<number | null>(null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [notableSignal, setNotableSignal] = useState('');

  const complete = energy !== null && body !== null && sleepQuality !== null;

  return (
    <form
      data-check-in-step
      className="flex flex-col gap-5 border border-dashed border-border bg-panel px-5 py-6"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (!complete) return;
        onSubmit({ energy, body, sleepQuality, notableSignal: notableSignal || null });
      }}
    >
      <p className="font-body text-sm text-muted-foreground">{t('intro')}</p>

      <ScoreRow label={t('energy')} value={energy} onChange={setEnergy} disabled={pending} />
      <ScoreRow label={t('body')} value={body} onChange={setBody} disabled={pending} />
      <ScoreRow label={t('sleep')} value={sleepQuality} onChange={setSleepQuality} disabled={pending} />

      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('signal')}
        </span>
        {/*
          The warning is part of the label, not a footnote. This field is the one
          place in the Check-in the athlete writes freely, and it is the one place
          whose contents reach the model verbatim - so what it is for, and what it
          is not for, belongs where they are typing rather than in a privacy page.
        */}
        <p className="mt-1 font-body text-xs text-muted-foreground">{t('signalHint')}</p>
        <textarea
          value={notableSignal}
          onChange={(e) => setNotableSignal(e.target.value)}
          rows={2}
          maxLength={500}
          disabled={pending}
          placeholder={t('signalPlaceholder')}
          className="mt-1.5 w-full resize-none border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-signal"
        />
      </label>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || !complete}
          className="inline-flex items-center gap-2 bg-signal px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-signal-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t('submit')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onSkip}
          className="font-body text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
        >
          {t('skip')}
        </button>
      </div>
    </form>
  );
}
