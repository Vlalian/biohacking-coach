'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PRESCRIBABLE_TYPES } from '@/features/session/type-colors';
import { prescribeSessionAction } from './prescribe-actions';
import type { CalendarWriter } from '@/app/[locale]/calendar';
import { beginAdd } from '@/features/session/calendar-writes';
import { prescribedSessionOf } from '@/features/coach/prescription';

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
 *
 * Rendered by the calendar beneath its grid and handed its writes
 * (showable-version/44): the new session shows on the calendar the moment it is
 * added, built by the same rule the server writes, and the server's answer
 * replaces it — or removes it, with the reason here.
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

export function PrescribePanel({
  athleteId,
  writer,
}: {
  athleteId: string;
  writer: CalendarWriter;
}) {
  const t = useTranslations('Prescribe');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!form.date || !form.type) {
      setError(t('error', { reason: 'invalid' }));
      return;
    }
    const input = toInput(form);
    const key = `tmp:${crypto.randomUUID()}`;
    setError(null);
    writer.begin((writes) => beginAdd(writes, prescribedSessionOf(key, input, 0)));
    startTransition(async () => {
      const result = await prescribeSessionAction(athleteId, input);
      if (!result.ok) {
        writer.settle(key, { ok: false });
        setError(t('error', { reason: result.reason }));
        return;
      }
      setForm(EMPTY);
      if (result.session) {
        writer.settle(key, { ok: true, session: result.session });
      } else {
        // The result type is shared with edit and delete, so `session` is
        // optional there; prescribe always sets it. Should it ever be missing,
        // drop the placeholder and read the page again rather than show a guess.
        writer.settle(key, { ok: false });
        router.refresh();
      }
    });
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
