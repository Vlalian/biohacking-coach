'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PRESCRIBABLE_TYPES } from '@/features/session/type-colors';
import { prescribeSessionAction, type PrescribeActionResult } from './prescribe-actions';

/**
 * The Head Coach's form for prescribing a session (ticket 12: full rules, lean
 * surface — no approval-queue UI).
 *
 * **Adding only, since showable-version/20.** It used to swap its own title
 * between "add" and "edit" and carry a list of sessions with edit and delete
 * beside them — so composing a new session and rewriting an existing one were
 * one control in two moods, and editing happened in the place you were
 * composing. Changing and deleting a session now live in the Session Drawer,
 * beside the session they act on, where every session opens whether the coach
 * may act on it or not (CONTEXT.md, Session Drawer).
 *
 * The server is still the authority: this component sends what to change, never
 * who is changing it, and every action re-resolves the Head Coach from the
 * session. A failed action surfaces its reason rather than pretending success.
 */


type FormState = {
  date: string;
  type: string;
  duration: string;
  zone: string;
  title: string;
  note: string;
};

const EMPTY: FormState = { date: '', type: 'Endurance', duration: '', zone: '', title: '', note: '' };

function toInput(form: FormState) {
  const duration = form.duration.trim() === '' ? null : Number(form.duration);
  return {
    date: form.date,
    type: form.type,
    duration: Number.isFinite(duration as number) ? (duration as number) : null,
    zone: form.zone.trim() || null,
    title: form.title.trim() || null,
    note: form.note.trim() || null,
  };
}

export function PrescribePanel({ athleteId }: { athleteId: string }) {
  const t = useTranslations('Prescribe');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<PrescribeActionResult>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) {
        setForm(EMPTY);
        router.refresh();
      } else {
        setError(t('error', { reason: result.reason }));
      }
    });

  const submit = () => {
    if (!form.date || !form.type) {
      setError(t('error', { reason: 'invalid' }));
      return;
    }
    run(() => prescribeSessionAction(athleteId, toInput(form)));
  };

  const field = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <section className="w-full max-w-3xl border border-border bg-panel p-5 shadow-sm sm:p-6">
      <h2 className="mb-3 font-display text-2xl font-bold uppercase italic tracking-[0.03em] text-foreground">
        {t('addTitle')}
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
          {t('date')}
          <input type="date" className="h-11 border border-border bg-background px-3 font-body text-base normal-case tracking-normal text-foreground outline-none focus:border-signal" {...field('date')} />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
          {t('type')}
          <select className="h-11 border border-border bg-background px-3 font-body text-base normal-case tracking-normal text-foreground outline-none focus:border-signal" {...field('type')}>
            {PRESCRIBABLE_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {ty}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
          {t('duration')}
          <input type="number" min={0} className="h-11 border border-border bg-background px-3 font-body text-base normal-case tracking-normal text-foreground outline-none focus:border-signal" {...field('duration')} />
        </label>
        <label className="flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground">
          {t('zone')}
          <input className="h-11 border border-border bg-background px-3 font-body text-base normal-case tracking-normal text-foreground outline-none focus:border-signal" {...field('zone')} />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground sm:col-span-1">
          {t('sessionTitle')}
          <input className="h-11 border border-border bg-background px-3 font-body text-base normal-case tracking-normal text-foreground outline-none focus:border-signal" {...field('title')} />
        </label>
        <label className="col-span-2 flex flex-col gap-1.5 font-body text-[13px] uppercase tracking-[0.12em] text-muted-foreground sm:col-span-3">
          {t('note')}
          <input className="h-11 border border-border bg-background px-3 font-body text-base normal-case tracking-normal text-foreground outline-none focus:border-signal" {...field('note')} />
        </label>
      </div>

      {error && <p className="mt-2 font-body text-sm text-destructive">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="inline-flex h-11 items-center justify-center bg-signal px-5 font-body text-base font-semibold text-signal-foreground transition-colors hover:bg-signal/85 disabled:opacity-50"
        >
          {t('add')}
        </button>
      </div>

    </section>
  );
}
