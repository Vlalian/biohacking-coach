'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { PlanSession } from '@/features/coach/roster-service';
import { FILTERABLE_TYPES } from '@/features/session/type-colors';
import {
  deletePrescribedSessionAction,
  editPrescribedSessionAction,
  prescribeSessionAction,
  type PrescribeActionResult,
} from './prescribe-actions';

/**
 * The Head Coach's lean plan-editing surface (ticket 12: full rules, lean
 * surface — no approval-queue UI). A form to prescribe a session, and per-plan
 * controls to edit or delete the sessions the Head Coach authors. Edit/delete
 * appear only on `editable` sessions — the same content-authority guard the
 * server enforces, so the button never offers what the server would refuse.
 *
 * The server is still the authority: this component sends what to change, never
 * who is changing it, and every action re-resolves the Head Coach from the
 * session. A failed action surfaces its reason rather than pretending success.
 */

const TYPES = [...FILTERABLE_TYPES, 'Rest', 'Strength'];

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
  planSessions,
}: {
  athleteId: string;
  planSessions: PlanSession[];
}) {
  const t = useTranslations('Prescribe');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<PrescribeActionResult>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) {
        setForm(EMPTY);
        setEditingId(null);
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
    const input = toInput(form);
    run(() =>
      editingId
        ? editPrescribedSessionAction(athleteId, editingId, input)
        : prescribeSessionAction(athleteId, input),
    );
  };

  const startEdit = (s: PlanSession) => {
    setEditingId(s.id);
    setError(null);
    setForm({
      date: s.date,
      type: s.type,
      duration: s.duration != null ? String(s.duration) : '',
      zone: s.zone ?? '',
      title: s.title ?? '',
      note: s.note ?? '',
    });
  };

  const field = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <section className="w-full max-w-3xl rounded-lg border p-4">
      <h2 className="mb-3 text-lg font-semibold">
        {editingId ? t('editTitle') : t('addTitle')}
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          {t('date')}
          <input type="date" className="rounded border bg-background px-2 py-1 text-sm" {...field('date')} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t('type')}
          <select className="rounded border bg-background px-2 py-1 text-sm" {...field('type')}>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {ty}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t('duration')}
          <input type="number" min={0} className="rounded border bg-background px-2 py-1 text-sm" {...field('duration')} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t('zone')}
          <input className="rounded border bg-background px-2 py-1 text-sm" {...field('zone')} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-1">
          {t('sessionTitle')}
          <input className="rounded border bg-background px-2 py-1 text-sm" {...field('title')} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs sm:col-span-3">
          {t('note')}
          <input className="rounded border bg-background px-2 py-1 text-sm" {...field('note')} />
        </label>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {editingId ? t('save') : t('add')}
        </button>
        {editingId && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setEditingId(null);
              setForm(EMPTY);
              setError(null);
            }}
            className="rounded border px-3 py-1 text-sm"
          >
            {t('cancel')}
          </button>
        )}
      </div>

      <ul className="mt-4 flex flex-col divide-y border-t">
        {planSessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              <span className="text-neutral-500">{s.date}</span> · {s.title ?? s.type}
              {!s.editable && <span className="ml-2 text-xs text-neutral-400">{t('athletesOwn')}</span>}
            </span>
            {s.editable && (
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startEdit(s)}
                  className="rounded border px-2 py-0.5 text-xs"
                >
                  {t('edit')}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deletePrescribedSessionAction(athleteId, s.id))}
                  className="rounded border px-2 py-0.5 text-xs text-red-600"
                >
                  {t('delete')}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
