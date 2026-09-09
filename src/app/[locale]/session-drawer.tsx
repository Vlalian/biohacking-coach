'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { formatFullDate } from '@/lib/date';
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
import { offeredStatusActions } from '@/features/session/session-status-rules';
import type { DrawerPolicy } from '@/features/session/drawer-policy';
import { athleteDrawerPolicy, headCoachDrawerPolicy } from '@/features/session/drawer-policy';
import {
  deletePrescribedSessionAction,
  editPrescribedSessionAction,
} from './(app)/coach/athlete/[athleteId]/prescribe-actions';
import {
  DEFAULT_TYPE_COLOR,
  PRESCRIBABLE_TYPES,
  TYPE_COLORS,
} from '@/features/session/type-colors';
import { useCoachOverlay } from '@/components/shell/coach-overlay-context';
import { undoDetectedImportAction } from './garmin-actions';
import {
  markCompleteAction,
  toggleSkipAction,
  toggleUnavailableAction,
  createAthleteSessionAction,
  updateAthleteSessionAction,
  deleteAthleteSessionAction,
} from './session-actions';

const ATHLETE_SESSION_TYPES = ['Mobility', 'Strength', 'Other'] as const;

/**
 * Every refusal a Session Drawer action can come back with, and the message
 * the athlete reads for it.
 *
 * The drawer used to store failure as a boolean, so `'future'` — "this session
 * is next week" — rendered as the same shrug as `'not-found'`. That is the
 * second half of showable-version/08: the athlete was told it did not work and
 * never why, when the honest answer would have ended the confusion.
 *
 * Keying the record on the union makes a new reason a type error here rather
 * than a generic string in front of a tester. As in `garmin-upload.tsx`, the
 * value type is `string`, so this proves every reason has an entry, not that
 * every entry names a message that exists — that would need next-intl's
 * `AppConfig.Messages` augmentation, which this repo does not have.
 *
 * Reasons an athlete can do nothing about — a missing row, someone else's
 * session, a signed-out tab — deliberately share the generic copy. Naming them
 * would leak the shape of the system without helping.
 */
export type ActionRefusal =
  | 'not-found'
  | 'not-owner'
  | 'not-athlete-authored'
  | 'invalid'
  | 'frozen'
  | 'future'
  | 'conflict'
  | 'not-authenticated'
  // From undoDetectedImport (showable-version/14), which arrived on a separate
  // branch. The type error this union raised on merge is the mechanism working:
  // a refusal the drawer has never heard of stops the build instead of quietly
  // rendering the generic string at a tester.
  | 'not-imported'
  // From the Head Coach's own actions (`prescribe-actions.ts`), which refuse
  // four ways the athlete's never do. All four mean the request no longer
  // matches the world — a severed link, a forged id, a race — so all four take
  // the generic copy by the rule above.
  | 'not-linked'
  | 'wrong-athlete'
  | 'forbidden-origin'
  | 'not-a-coach';

export const REFUSAL_KEY: Record<ActionRefusal, string> = {
  future: 'errorFuture',
  frozen: 'errorFrozen',
  conflict: 'errorConflict',
  'not-found': 'error',
  'not-owner': 'error',
  'not-athlete-authored': 'error',
  invalid: 'error',
  'not-authenticated': 'error',
  // Generic on purpose, by the rule above: an athlete cannot act on "the event
  // log does not call this completion an import". They see undo only where
  // there IS an import, so reaching this means the session changed underneath
  // them or the id was forged — neither is theirs to fix.
  'not-imported': 'error',
  'not-linked': 'error',
  'wrong-athlete': 'error',
  'forbidden-origin': 'error',
  'not-a-coach': 'error',
};

/**
 * Why a viewer may not edit this session's content, in words.
 *
 * Keyed on the union so a new refusal is a type error here rather than a blank
 * line where an explanation should be — the same property `REFUSAL_KEY` has,
 * for the same reason.
 */
export const CONTENT_REFUSAL_KEY: Record<NonNullable<DrawerPolicy['contentRefusal']>, string> = {
  'athletes-own': 'refusalAthletesOwn',
  'imported-record': 'refusalImportedRecord',
  'frozen-record': 'refusalFrozenRecord',
  'authors-content': 'refusalAuthorsContent',
};

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
  importedSessionIds,
  locale,
  todayKey,
  onClose,
  onRate,
  onEditRequest,
  coachAthleteId,
}: {
  state: DrawerState;
  /** Resolved fresh every render, never snapshotted at open-time — after a
   *  status action + router.refresh(), the drawer must show the new status,
   *  not what it looked like when it was opened. */
  sessions: Session[];
  /** Sessions completed by accepting a Detected Activity — the only ones that
   *  offer an undo, so this is not a general un-complete control. */
  importedSessionIds: string[];
  locale: string;
  todayKey: string;
  onClose: () => void;
  onRate: (session: Session) => void;
  onEditRequest: (session: Session) => void;
  /**
   * Set when the Head Coach is the viewer, to the athlete whose calendar this
   * is. Its presence is what switches the drawer's policy and routes the
   * content actions through the coach's own server actions.
   *
   * The id is a claim, not an authority: `prescribe-actions` re-resolves the
   * acting coach and re-proves the Coaching Link before anything is written, so
   * a tampered value buys nothing (ADR 0006).
   */
  coachAthleteId?: string;
}) {
  const t = useTranslations('SessionDrawer');
  const router = useRouter();
  const coachOverlay = useCoachOverlay();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionRefusal | null>(null);
  // Bound only while open: this component stays mounted and renders null when
  // closed, so an unconditional binding would swallow Escape for the whole page.
  const panelRef = useDialogFocus<HTMLElement>(onClose, state.open);

  if (!state.open) return null;

  function run(
    action: () => Promise<{ ok: true } | { ok: false; reason: ActionRefusal }>,
    after?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        // Carry the reason, not just the fact. The server already told us why
        // (ADR 0006 makes it the authority); throwing that away was the bug.
        setError(result.reason);
        // A conflict is the one refusal the actor can do something about, and
        // without this it is a dead end: the form would keep re-sending the
        // version it has already been refused for, failing identically forever.
        // `PrescribePanel` solved this by adopting the winner's version by hand;
        // here a refresh is enough, because `session` is resolved from the
        // `sessions` prop on every render rather than snapshotted at open time —
        // so the next submit carries the row as it now stands, while the form's
        // own fields keep what the coach typed.
        if (result.reason === 'conflict') router.refresh();
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
              {t(REFUSAL_KEY[error])}
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
          ) : mode === 'edit' && session && coachAthleteId ? (
            <HeadCoachSessionForm
              session={session}
              pending={pending}
              t={t}
              onSubmit={(input) =>
                run(
                  () =>
                    editPrescribedSessionAction(
                      coachAthleteId,
                      session.id,
                      input,
                      session.version,
                    ),
                  onClose,
                )
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
                run(() => updateAthleteSessionAction(session.id, input, session.version), onClose)
              }
            />
          ) : session ? (
            <ViewBody
              policy={
                coachAthleteId
                  ? headCoachDrawerPolicy(session, todayKey)
                  : athleteDrawerPolicy(session)
              }
              session={session}
              fromImport={importedSessionIds.includes(session.id)}
              todayKey={todayKey}
              locale={locale}
              pending={pending}
              t={t}
              onMarkComplete={() => run(() => markCompleteAction(session.id))}
              onSkip={() => run(() => toggleSkipAction(session.id))}
              onMarkUnavailable={() => run(() => toggleUnavailableAction(session.id))}
              onUndoImport={() => run(() => undoDetectedImportAction(session.id))}
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
              onDelete={() =>
                run(
                  () =>
                    coachAthleteId
                      ? deletePrescribedSessionAction(coachAthleteId, session.id, session.version)
                      : deleteAthleteSessionAction(session.id, session.version),
                  onClose,
                )
              }
            />
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/**
 * The read-only body of the drawer, exported so its action gating can be
 * tested. It takes `t` as a prop and holds no hooks of its own, so a test can
 * call it and walk the element tree — this repo has no DOM renderer, and the
 * wiring between `offeredStatusActions` and these buttons is exactly the seam
 * showable-version/08 was hiding in.
 */
export function ViewBody({
  session,
  policy,
  fromImport,
  todayKey,
  locale,
  pending,
  t,
  onMarkComplete,
  onSkip,
  onMarkUnavailable,
  onUndoImport,
  onDiscussWithCoach,
  onRate,
  onEdit,
  onDelete,
}: {
  session: Session;
  /** Completed by accepting a Detected Activity, so the accept is reversible. */
  fromImport: boolean;
  todayKey: string;
  locale: string;
  pending: boolean;
  t: ReturnType<typeof useTranslations<'SessionDrawer'>>;
  onMarkComplete: () => void;
  onSkip: () => void;
  onMarkUnavailable: () => void;
  onUndoImport: () => void;
  onDiscussWithCoach: () => void;
  onRate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /**
   * What this viewer may do, decided in `drawer-policy.ts`.
   *
   * A parameter since 2026-09-04, because the drawer serves two audiences now
   * (CONTEXT.md, Session Drawer). It used to decide the athlete's policy inline
   * — `session.origin === 'athlete'` — which is why there was nowhere to put the
   * Head Coach without a second component.
   */
  policy: DrawerPolicy;
}) {
  const color = TYPE_COLORS[session.type] ?? DEFAULT_TYPE_COLOR;
  const rules = offeredStatusActions({ date: session.date, status: session.status }, todayKey);
  // The rule says what this *session* allows; the policy says what this
  // *viewer* may do. Both, always — a Head Coach must not complete a session
  // the athlete could, and neither may complete one that is frozen.
  const offered = {
    complete: policy.ownReport && rules.complete,
    skip: policy.ownReport && rules.skip,
    unavailable: policy.ownReport && rules.unavailable,
  };

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
          {!policy.content && (
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
            {/* Reading a reflection is the coach's job; writing one is not. The
                reflection itself stays visible where Link Visibility permits it
                — that is decided server-side in `roster-service` — and only the
                control that changes it is withheld. */}
            {policy.ownReport && (
              <button
                type="button"
                onClick={onRate}
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal hover:underline"
              >
                {t('editRating')}
              </button>
            )}
          </div>
        ) : session.status === 'completed' ? (
          <div className="mt-2 flex items-center justify-between border border-dashed border-border p-3">
            <span className="font-body text-sm text-muted-foreground">{t('notRated')}</span>
            {policy.ownReport && (
              <button
                type="button"
                onClick={onRate}
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal hover:underline"
              >
                {t('rate')}
              </button>
            )}
          </div>
        ) : (
          <p className="mt-2 font-body text-sm text-muted-foreground">{t('notRated')}</p>
        )}
      </section>

      <section className="space-y-2">
        {offered.complete && (
          <Action icon={CheckCircle2} primary disabled={pending} onClick={onMarkComplete}>
            {t('markComplete')}
          </Action>
        )}
        {offered.skip && (
          <Action
            icon={session.status === 'skipped' ? Undo2 : CalendarX2}
            disabled={pending}
            onClick={onSkip}
          >
            {session.status === 'skipped' ? t('undoSkip') : t('skip')}
          </Action>
        )}
        {/* The only way back from an accepted Detected Activity. Completing is
            one-directional and Skip, Session Move and delete all refuse a
            completed Coach-planned session, so without this a wrong file was
            permanent (showable-version/14). Offered only where the event log
            says the completion came from an import, so it is not a general
            un-complete control. */}
        {policy.ownReport && fromImport && (
          <Action icon={Undo2} disabled={pending} onClick={onUndoImport}>
            {t('undoImport')}
          </Action>
        )}
        {/* `!frozen` moved into offeredStatusActions with the other two gates
            (showable-version/08), so this asks the rule rather than restating
            it. The undo above stays outside it deliberately: it is offered on a
            session that IS frozen, which is the whole point of it. */}
        {offered.unavailable && (
          <Action
            icon={session.status === 'unavailable' ? Undo2 : CalendarX2}
            disabled={pending}
            onClick={onMarkUnavailable}
          >
            {session.status === 'unavailable' ? t('undoUnavailable') : t('unavailable')}
          </Action>
        )}
        {policy.discuss && (
          <Action icon={MessageSquare} onClick={onDiscussWithCoach}>
            {t('discuss')}
          </Action>
        )}
        {/* The Head Coach's drawer names an absent action; the athlete's omits
            it silently. Deliberate, and about audience rather than consistency
            (CONTEXT.md, Session Drawer): a coach is exercising a delegated
            authority and needs to know its edges. */}
        {!policy.content && policy.explainsRefusals && policy.contentRefusal && (
          <p className="font-body text-sm text-muted-foreground">
            {t(CONTENT_REFUSAL_KEY[policy.contentRefusal])}
          </p>
        )}
        {policy.content && (
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


/**
 * The Head Coach's edit form, in the drawer rather than in the prescribe panel.
 *
 * It used to live in `PrescribePanel`, which swapped its own title between
 * "add" and "edit" — so composing a new session and rewriting an existing one
 * were one control in two moods, and editing happened in the place you were
 * composing (showable-version/20). Adding stays there; changing moved here,
 * beside the session it changes.
 *
 * The field set is the Head Coach's, not the athlete's: a Coach-authored
 * session carries a date, a zone and a title, and its type comes from the
 * Coach's own list rather than Mobility/Strength/Other.
 */
function HeadCoachSessionForm({
  session,
  pending,
  t,
  onSubmit,
}: {
  session: Session;
  pending: boolean;
  t: ReturnType<typeof useTranslations<'SessionDrawer'>>;
  onSubmit: (input: {
    date: string;
    type: string;
    duration: number | null;
    zone: string | null;
    title: string | null;
    note: string | null;
  }) => void;
}) {
  const [date, setDate] = useState(session.date);
  const [type, setType] = useState(session.type);
  const [duration, setDuration] = useState(session.duration?.toString() ?? '');
  const [zone, setZone] = useState(session.zone ?? '');
  const [title, setTitle] = useState(session.title ?? '');
  const [note, setNote] = useState(session.note ?? '');

  const parsed = duration.trim() === '' ? null : Number(duration);

  return (
    <form
      className="space-y-4 px-5 py-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          date,
          type,
          duration: Number.isFinite(parsed as number) ? (parsed as number) : null,
          zone: zone.trim() || null,
          title: title.trim() || null,
          note: note.trim() || null,
        });
      }}
    >
      <Field label={t('formDate')}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
      </Field>
      <Field label={t('formType')}>
        <select value={type} onChange={(e) => setType(e.target.value)} className={FIELD}>
          {/* The stored type leads when it is not one this form offers. The
              server only trims the type, so a Prescribed Session can hold one
              outside the list; without this the select showed the first option
              while `type` still held the old value, and submitting unchanged
              sent a type the coach never saw. CodeRabbit, PR #57. */}
          {(PRESCRIBABLE_TYPES.includes(session.type)
            ? PRESCRIBABLE_TYPES
            : [session.type, ...PRESCRIBABLE_TYPES]
          ).map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('formDuration')}>
        <input
          type="number"
          min="1"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className={FIELD}
        />
      </Field>
      <Field label={t('formZone')}>
        <input value={zone} onChange={(e) => setZone(e.target.value)} className={FIELD} />
      </Field>
      <Field label={t('formTitle')}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} />
      </Field>
      <Field label={t('formNote')}>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="w-full border border-signal px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-signal disabled:opacity-50"
      >
        {t('save')}
      </button>
    </form>
  );
}

const FIELD =
  'w-full border border-border bg-transparent px-2 py-1.5 font-body text-sm text-foreground';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </label>
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
