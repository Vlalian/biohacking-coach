'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Bike, Footprints, Pencil, Plus, Trash2, Watch, Wrench, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { EQUIPMENT_CATEGORIES, type EquipmentCategory, type EquipmentItem } from '@/features/equipment/equipment';
import {
  createEquipmentItemAction,
  deleteEquipmentItemAction,
  updateEquipmentItemAction,
} from './equipment-actions';

/**
 * The Equipment screen — ported from Lovable's design (already built in the
 * Trackside visual language) and wired to the real per-athlete CRUD
 * (`features/equipment`) instead of local mock state. Every write revalidates
 * the shell (equipment feeds the Coach's prompts) and the UI re-reads through
 * `router.refresh()`, the same pattern the Session Drawer uses.
 */

const CATEGORY_ICON: Record<EquipmentCategory, typeof Bike> = {
  bike: Bike,
  shoes: Footprints,
  watch: Watch,
  other: Wrench,
};

type FormState =
  | { open: false }
  | { open: true; mode: 'create' }
  | { open: true; mode: 'edit'; item: EquipmentItem };

export function EquipmentView({ items }: { items: EquipmentItem[] }) {
  const t = useTranslations('Equipment');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [form, setForm] = useState<FormState>({ open: false });

  function run(action: () => Promise<{ ok: boolean }>, after?: () => void) {
    setError(false);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(true);
        return;
      }
      router.refresh();
      after?.();
    });
  }

  return (
    <div className="w-full max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal">{t('eyebrow')}</p>
          <h1 className="mt-2 font-display text-5xl tracking-[0.04em] text-foreground">{t('title')}</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{t('lede')}</p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setForm({ open: true, mode: 'create' })}
            className="flex items-center gap-2 border border-signal px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-signal transition-colors hover:bg-signal hover:text-signal-foreground"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('addItem')}
          </button>
        )}
      </header>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {t('error')}
        </p>
      )}

      {items.length === 0 && (
        <div className="mt-10 border border-dashed border-border bg-panel px-8 py-14 text-center">
          <Bike className="mx-auto h-8 w-8 text-signal" aria-hidden="true" />
          <h2 className="mt-4 font-display text-3xl tracking-[0.04em] text-foreground">
            {t('emptyTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t('emptyBody')}
          </p>
          <button
            type="button"
            onClick={() => setForm({ open: true, mode: 'create' })}
            className="mt-6 inline-flex items-center gap-2 border border-signal px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-signal transition-colors hover:bg-signal hover:text-signal-foreground"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('emptyCta')}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-8 space-y-8">
          {EQUIPMENT_CATEGORIES.map((cat) => {
            const catItems = items.filter((e) => e.category === cat);
            if (catItems.length === 0) return null;
            const Icon = CATEGORY_ICON[cat];
            return (
              <section key={cat}>
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-signal" aria-hidden="true" />
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    {t(`category_${cat}`)}
                  </h2>
                  <span className="font-mono text-[10px] text-muted-foreground/60">{catItems.length}</span>
                </div>
                <ul className="mt-3 divide-y divide-border border border-border bg-panel">
                  {catItems.map((item) => (
                    <li
                      key={item.id}
                      className="group flex flex-wrap items-start justify-between gap-3 px-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="font-display text-xl tracking-[0.02em] text-foreground">{item.name}</p>
                        {item.details && (
                          <p className="mt-1 text-sm text-muted-foreground">{item.details}</p>
                        )}
                        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                          {t('added')} {item.addedDate}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <IconButton
                          label={t('edit')}
                          disabled={pending}
                          onClick={() => setForm({ open: true, mode: 'edit', item })}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          label={t('remove')}
                          disabled={pending}
                          onClick={() => run(() => deleteEquipmentItemAction(item.id))}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {form.open && (
        <EquipmentForm
          t={t}
          pending={pending}
          item={form.mode === 'edit' ? form.item : undefined}
          onCancel={() => setForm({ open: false })}
          onSubmit={(draft) => {
            const close = () => setForm({ open: false });
            if (form.mode === 'edit') run(() => updateEquipmentItemAction(form.item.id, draft), close);
            else run(() => createEquipmentItemAction(draft), close);
          }}
        />
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="border border-transparent p-1.5 text-muted-foreground transition-colors hover:border-border hover:text-signal disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function EquipmentForm({
  t,
  item,
  pending,
  onCancel,
  onSubmit,
}: {
  t: ReturnType<typeof useTranslations<'Equipment'>>;
  item?: EquipmentItem;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (draft: { category: EquipmentCategory; name: string; details: string | null }) => void;
}) {
  const [category, setCategory] = useState<EquipmentCategory>(item?.category ?? 'bike');
  const [name, setName] = useState(item?.name ?? '');
  const [details, setDetails] = useState(item?.details ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 sm:items-center sm:p-6">
      <div className="w-full max-w-md border border-border bg-panel">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal">
            {item ? t('editItem') : t('addItem')}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('cancel')}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form
          className="space-y-5 px-4 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSubmit({ category, name: name.trim(), details: details.trim() || null });
          }}
        >
          <fieldset>
            <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t('fieldCategory')}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {EQUIPMENT_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={[
                    'border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors',
                    category === cat
                      ? 'border-signal text-signal'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {t(`category_${cat}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t('fieldName')}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              className="mt-2 w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-signal"
            />
          </label>

          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t('fieldDetails')}
            </span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={t('detailsPlaceholder')}
              rows={3}
              className="mt-2 w-full resize-none border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-signal"
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || pending}
              className="border border-signal px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-signal transition-colors hover:bg-signal hover:text-signal-foreground disabled:opacity-40"
            >
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
