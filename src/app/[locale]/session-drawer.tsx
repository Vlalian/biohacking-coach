'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import {
  CalendarX2,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Pencil,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type { Session } from '@/features/session/session';
import { isFrozen } from '@/features/session/move-rules';
import { DEFAULT_TYPE_COLOR, TYPE_COLORS } from '@/features/session/type-colors';
import { useCoachOverlay } from '@/components/shell/coach-overlay-context';
import {
  markCompleteAction,
  toggleSkipAction,
  toggleUnavailableAction,
  createAthleteSessionAction,
  updateAthleteSessionAction,
  deleteAthleteSessionAction,
} from './session-actions';

const ATHLETE_SESSION_TYPES = ['Mobility', 'Strength', 'Other'] as const;

const STATUS_KEY: Record<string, string> = {
  completed: 'statusCompleted',
  planned: 'statusPlanned',
  skipped: 'statusSkipped',
  unavailable: 'statusUnavailable',
};

const TYPE_LABEL_KEY: Record<string, string> = {
  Mobility: 'typeMobility',
  Strength: 'typeStrength',
  Other: 'typeOther',
};

function formatFullDate(iso: string, locale: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
}

type DrawerState =
  | { open: false }
  | { open: true; mode: 'view'; sessionId: string }
  | { open: true; mode: 'create'; date: string }
  | { open: true; mode: 'edit'; sessionId: string };

/**
 * The Session Drawer (CONTEXT.md): the one detail surface for a session, and
 * the create/edit form for Athlete Sessions. Slides from the right, mirroring
 * the Navigation Drawer. Ported from the Lovable design onto the real
 * `Session` shape and the session-actions.ts server actions — origin gates
 * edit/delete (only 'athlete'-authored content is the athlete's to change,
 * CONTEXT.md's Prescribed Session), and Rate opens the existing RatingModal
 * via the `onRate` callback rather than duplicating its RPE picker here.
 */
export function SessionDrawer({
  state,
  sessions,
  locale,
  todayKey,
  onClose,
  onRate,
  onEditRequest,
}: {
  state: DrawerState;
  /** Resolved fresh every render, never snapshotted at open-time — after a
   *  status action + router.refresh(), the drawer must show the new status,
   *  not what it looked like when it was opened. */
  sessions: Session[];
  locale: string;
  todayKey: string;
  onClose: () => void;
  onRate: (session: Session) => void;
  onEditRequest: (session: Session) => void;
}) {
  const t = useTranslations('SessionDrawer');
  const router = useRouter();
  const coachOverlay = useCoachOverlay();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  // Bound only while open: this component stays mounted and renders null when
  // closed, so an unconditional binding would swallow Escape for the whole page.
  const panelRef = useDialogFocus<HTMLElement>(onClose, state.open);

  if (!state.open) return null;

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

  const mode = state.mode;
  const session =
    mode !== 'create' ? sessions.find((s) => s.id === state.sessionId) : undefined;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={t('close')}
        onClick={onClose}
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-panel shadow-2xl outline-none"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            {mode === 'create' ? t('createTitle') : mode === 'edit' ? t('edit') : t('title')}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && (
            <p role="alert" className="px-5 pt-4 font-body text-sm text-destructive">
              {t('error')}
            </p>
          )}

          {mode === 'create' ? (
            <AthleteSessionForm
              date={state.date}
              todayKey={todayKey}
              locale={locale}
              pending={pending}
              t={t}
              onSubmit={(input) =>
                run(() => createAthleteSessionAction({ date: state.date, ...input }), onClose)
              }
            />
          ) : mode === 'edit' && session ? (
            <AthleteSessionForm
              date={session.date}
              todayKey={todayKey}
              locale={locale}
              pending={pending}
              t={t}
              initial={{
                type: session.type,
                durationMin: session.duration,
                isTraining: session.isTraining,
                note: session.note ?? '',
              }}
              onSubmit={(input) =>
                run(() => updateAthleteSessionAction(session.id, input), onClose)
              }
            />
          ) : session ? (
            <ViewBody
              session={session}
              todayKey={todayKey}
              locale={locale}
              pending={pending}
              t={t}
              onMarkComplete={() => run(() => markCompleteAction(session.id))}
              onSkip={() => run(() => toggleSkipAction(session.id))}
              onMarkUnavailable={() => run(() => toggleUnavailableAction(session.id))}
              onDiscussWithCoach={() => {
                // Carry the session into the thread as a Reference (CONTEXT.md,
                // Coach Overlay) — the id is a claim the server re-checks against
                // the signed-in athlete, the label is what the athlete sees.
                coachOverlay.setReference({
                  sessionId: session.id,
                  label: `${session.type} · ${formatFullDate(session.date, locale)}`,
                });
                coachOverlay.setOpen(true);
                onClose();
              }}
              onRate={() => onRate(session)}
              onEdit={() => onEditRequest(session)}
              onDelete={() => run(() => deleteAthleteSessionAction(session.id), onClose)}
            />
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function ViewBody({
  session,
  todayKey,
  locale,
  pending,
  t,
  onMarkComplete,
  onSkip,
  onMarkUnavailable,
  onDiscussWithCoach,
  onRate,
  onEdit,
  onDelete,
}: {
  session: Session;
  todayKey: string;
  locale: string;
  pending: boolean;
  t: ReturnType<typeof useTranslations<'SessionDrawer'>>;
  onMarkComplete: () => void;
  onSkip: () => void;
  onMarkUnavailable: () => void;
  onDiscussWithCoach: () => void;
  onRate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isAthlete = session.origin === 'athlete';
  const color = TYPE_COLORS[session.type] ?? DEFAULT_TYPE_COLOR;
  const frozen = isFrozen({ date: session.date, status: session.status }, todayKey);

  return (
    <div className="space-y-6 px-5 py-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5" style={{ backgroundColor: color }} />
          <span className="font-display text-3xl leading-none tracking-[0.06em]" style={{ color }}>
            {session.type}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            {t(STATUS_KEY[session.status] ?? 'statusPlanned')}
          </span>
          <span className="font-body text-sm text-muted-foreground">
            {formatFullDate(session.date, locale)}
          </span>
        </div>
      </div>

      <section>
        <SectionLabel>{t('params')}</SectionLabel>
        <dl className="mt-2 grid grid-cols-2 gap-px border border-border bg-border">
          <Param
            label={t('duration')}
            value={session.duration ? `${session.duration} ${t('minutes')}` : '—'}
          />
          <Param label={t('zone')} value={session.zone ?? '—'} />
        </dl>
      </section>

      {session.note && (
        <section>
          <SectionLabel>{t('note')}</SectionLabel>
          <p
            className="mt-2 border-l-2 pl-3 font-body text-[15px] leading-relaxed text-foreground"
            style={{ borderColor: color }}
          >
            {session.note}
          </p>
          {!isAthlete && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {t('readOnlyNote')}
            </p>
          )}
        </section>
      )}

      <section>
        <SectionLabel>{t('reflection')}</SectionLabel>
        {session.feedbackBody != null && session.feedbackMind != null ? (
          <div className="mt-2 space-y-3 border border-border p-3">
            <Rpe label="Body" value={session.feedbackBody} />
            <Rpe label="Mind" value={session.feedbackMind} />
            {session.feedbackComment && (
              <p className="font-body text-sm text-muted-foreground">{session.feedbackComment}</p>
            )}
            <button
              type="button"
              onClick={onRate}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal hover:underline"
            >
              {t('editRating')}
            </button>
          </div>
        ) : session.status === 'completed' ? (
          <div className="mt-2 flex items-center justify-between border border-dashed border-border p-3">
            <span className="font-body text-sm text-muted-foreground">{t('notRated')}</span>
            <button
              type="button"
              onClick={onRate}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal hover:underline"
            >
              {t('rate')}
            </button>
          </div>
        ) : (
          <p className="mt-2 font-body text-sm text-muted-foreground">{t('notRated')}</p>
        )}
      </section>

      <section className="space-y-2">
        {session.status !== 'completed' && (
          <Action icon={CheckCircle2} primary disabled={pending} onClick={onMarkComplete}>
            {t('markComplete')}
          </Action>
        )}
        {!frozen && (
          <Action
            icon={session.status === 'skipped' ? Undo2 : CalendarX2}
            disabled={pending}
            onClick={onSkip}
          >
            {session.status === 'skipped' ? t('undoSkip') : t('skip')}
          </Action>
        )}
        {!frozen && (
          <Action
            icon={session.status === 'unavailable' ? Undo2 : CalendarX2}
            disabled={pending}
            onClick={onMarkUnavailable}
          >
            {session.status === 'unavailable' ? t('undoUnavailable') : t('unavailable')}
          </Action>
        )}
        <Action icon={MessageSquare} onClick={onDiscussWithCoach}>
          {t('discuss')}
        </Action>
        {isAthlete && (
          <>
            <Action icon={Pencil} onClick={onEdit}>
              {t('edit')}
            </Action>
            <Action icon={Trash2} destructive disabled={pending} onClick={onDelete}>
              {t('delete')}
            </Action>
          </>
        )}
      </section>
    </div>
  );
}

function AthleteSessionForm({
  date,
  todayKey,
  locale,
  pending,
  t,
  initial,
  onSubmit,
}: {
  date: string;
  todayKey: string;
  locale: string;
  pending: boolean;
  t: ReturnType<typeof useTranslations<'SessionDrawer'>>;
  initial?: { type: string; durationMin: number | null; isTraining: boolean; note: string };
  onSubmit: (input: {
    type: string;
    durationMin: number | null;
    isTraining: boolean;
    note: string | null;
  }) => void;
}) {
  const [type, setType] = useState(initial?.type ?? ATHLETE_SESSION_TYPES[0]);
  const [durationMin, setDurationMin] = useState<number | null>(initial?.durationMin ?? 30);
  const [isTraining, setIsTraining] = useState(initial?.isTraining ?? true);
  const [note, setNote] = useState(initial?.note ?? '');
  const isPast = date <= todayKey;

  return (
    <form
      className="space-y-5 px-5 py-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ type, durationMin, isTraining, note: note.trim() || null });
      }}
    >
      <div>
        <span className="font-display text-3xl tracking-[0.06em] text-foreground">
          {t('createLabel')}
        </span>
        <p className="mt-1 font-body text-sm text-muted-foreground">
          {formatFullDate(date, locale)}
        </p>
        {isPast && !initial && (
          <p className="mt-2 border-l-2 border-signal pl-3 font-body text-sm text-signal">
            {t('retroNote')}
          </p>
        )}
      </div>

      <div>
        <SectionLabel>{t('createType')}</SectionLabel>
        <div className="mt-2 flex gap-2">
          {ATHLETE_SESSION_TYPES.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              className={[
                'border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors',
                k === type
                  ? 'border-signal text-signal'
                  : 'border-border text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {t(TYPE_LABEL_KEY[k])}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <SectionLabel>{t('createDuration')}</SectionLabel>
        <input
          type="number"
          min={5}
          step={5}
          value={durationMin ?? ''}
          onChange={(e) => {
            // A number input yields '' when cleared and for input the browser
            // cannot parse. `Number('')` is 0 and `Number('abc')` is NaN, both of
            // which the server then refuses as invalid — so read them as "no
            // duration", which the domain allows, instead of a bad number.
            const raw = e.target.value.trim();
            const parsed = Number(raw);
            setDurationMin(raw === '' || !Number.isFinite(parsed) ? null : parsed);
          }}
          className="mt-2 w-full border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-signal"
        />
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={isTraining}
          onChange={(e) => setIsTraining(e.target.checked)}
          className="h-4 w-4 accent-[var(--signal)]"
        />
        <span className="font-body text-sm text-foreground">{t('createTrainingToggle')}</span>
      </label>

      <label className="block">
        <SectionLabel>{t('createNote')}</SectionLabel>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-2 w-full resize-none border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none focus:border-signal"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 bg-signal px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-signal-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {initial ? t('saveChanges') : t('createSubmit')}
      </button>
    </form>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
      {children}
    </span>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel px-3 py-2.5">
      <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-display text-2xl tracking-[0.04em] text-foreground">{value}</dd>
    </div>
  );
}

/** RPE 1–5 (the Session Reflection scale — src/features/session/rate-session.ts). */
function Rpe({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-1 gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={['h-2 flex-1', i < value ? 'bg-signal' : 'bg-border'].join(' ')} />
        ))}
      </div>
      <span className="w-8 text-right font-mono text-xs text-foreground">{value}/5</span>
    </div>
  );
}

function Action({
  icon: Icon,
  children,
  onClick,
  primary,
  destructive,
  disabled,
}: {
  icon: typeof CheckCircle2;
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex w-full items-center gap-3 border px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors disabled:opacity-40',
        primary
          ? 'border-signal bg-signal text-signal-foreground hover:opacity-90'
          : destructive
            ? 'border-border text-destructive hover:border-destructive'
            : 'border-border text-foreground hover:border-signal hover:text-signal',
      ].join(' ')}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

export type { DrawerState };
