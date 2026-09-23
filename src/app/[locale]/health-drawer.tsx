'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { formatFullDate } from '@/lib/date';
import type { HealthNoteRow } from '@/db/schema';
import { ALLOWANCES, DISCIPLINES, type Allowance, type Capacity } from '@/features/health/capacity';
import { MISTAKE_WINDOW_MS, glanceParts, type HealthSpan } from '@/features/health/health-layer';
import {
  addHealthNoteAction,
  closeIllnessAction,
  closeInjuryAction,
  declareIllnessAction,
  declareInjuryAction,
  deleteIllnessAction,
  deleteInjuryAction,
  readHealthNotesAction,
  setBotherAction,
  type HealthSubject,
} from './health-actions';
import {
  addHealthNoteAsCoachAction,
  readHealthNotesAsCoachAction,
} from './(app)/coach/athlete/[athleteId]/health-actions';

/**
 * Where the athlete says what their body can do, and where they and their Head
 * Coach read and add to the detail thread (`training-architecture/06`).
 *
 * Two roles, one drawer. The **athlete** declares (the form asks what they can
 * do — capacity, never diagnosis), closes ("I'm back" / "Illness over" — not
 * "recovered", which is a clinical judgment), rates how much it bothers them,
 * and notes. The **Head Coach** sees everything the athlete sees (Mads,
 * 2026-09-11) and may only add a note: declaring, closing and rating are the
 * athlete's statements about their own body.
 *
 * The thread is for human eyes only (ADR 0011). It is fetched here, by the
 * athlete's own action or the coach's link-gated one, and rendered; nothing on
 * this path reaches a prompt — `detail-thread-never-prompts.test.ts` names
 * this file as one of the few allowed to touch it.
 *
 * **The consent gate (ticket 14, parked)** sits behind the two declare actions,
 * not in this component: the drawer will not need to change when it lands.
 *
 * `showable-version/28a` (Mads, 2026-09-17/18): one list — open records first,
 * expanded (name · dates, then the glance); past ones collapsed under a fold,
 * each its own fold with the same line as summary. The injury carries a short
 * name ("left knee"). A record younger than 24 hours offers "declared by
 * mistake", which deletes it; after that it is history.
 */
export type HealthDrawerState =
  | { open: false }
  | { open: true; kind?: 'injury' | 'illness'; id?: string };

export function HealthDrawer({
  state,
  spans,
  locale,
  onClose,
  coachAthleteId,
}: {
  state: HealthDrawerState;
  /** Every span, open and closed — the drawer sorts them. */
  spans: HealthSpan[];
  locale: string;
  onClose: () => void;
  /** Set when the Head Coach is the one looking. Read-only except for notes. */
  coachAthleteId?: string;
}) {
  const t = useTranslations('HealthDrawer');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const panelRef = useDialogFocus<HTMLElement>(onClose, state.open);
  const isCoach = Boolean(coachAthleteId);

  // Closed is closed, including a record closed today: the calendar draws `to`
  // inclusively so the band covers the last day, but the drawer must not keep
  // offering "I'm back" and the Bother Rating on it (CodeRabbit, PR #67).
  const open = spans.filter((s) => s.to === null);
  const closed = spans.filter((s) => s.to !== null);
  const [selectedId, setSelectedId] = useState<string | null>(() => initialSelection(state, open));
  // The clock for "declared by mistake": read once, when the drawer mounts,
  // on whichever side renders it. A record on the 24 h boundary may differ by
  // the request's latency between server and client markup; the action
  // decides on its own clock either way.
  const [now] = useState(Date.now);
  if (!state.open) return null;

  function run(action: () => Promise<{ ok: boolean; reason?: string }>) {
    setError(null);
    startTransition(async () => {
      // A rejected action (network, server) is an error like a refused one:
      // without the catch the drawer shows nothing (CodeRabbit, PR #86).
      const result = await action().catch(() => ({ ok: false as const }));
      if (!result.ok) setError('reason' in result && result.reason === 'too-old' ? 'tooOld' : 'error');
      else router.refresh();
    });
  }

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
            {isCoach ? t('coachTitle') : t('title')}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p role="alert" className="mb-3 font-body text-sm text-destructive">
              {t(error === 'tooOld' ? 'tooOld' : 'error')}
            </p>
          )}

          {open.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground">
              {isCoach ? t('nothingOpenCoach') : t('nothingOpen')}
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border">
              {open.map((span) => (
                <li
                  key={span.id}
                  data-record={span.id}
                  data-open="true"
                  data-selected={selectedId === span.id ? span.id : undefined}
                >
                  <RecordRow
                    span={span}
                    selected={selectedId === span.id}
                    isCoach={isCoach}
                    pending={pending}
                    locale={locale}
                    t={t}
                    canDelete={!isCoach && now - span.openedAt.getTime() < MISTAKE_WINDOW_MS}
                    onSelect={() => setSelectedId(span.id)}
                    onClose={() =>
                      run(() =>
                        span.kind === 'injury' ? closeInjuryAction(span.id) : closeIllnessAction(span.id),
                      )
                    }
                    onDelete={() =>
                      run(() =>
                        span.kind === 'injury' ? deleteInjuryAction(span.id) : deleteIllnessAction(span.id),
                      )
                    }
                    onBother={(value) => run(() => setBotherAction(subjectOf(span), value))}
                  />
                  {selectedId === span.id && (
                    <Thread
                      subject={subjectOf(span)}
                      coachAthleteId={coachAthleteId}
                      pending={pending}
                      t={t}
                      onAdd={(body) =>
                        run(() =>
                          coachAthleteId
                            ? addHealthNoteAsCoachAction(coachAthleteId, subjectOf(span), body)
                            : addHealthNoteAction(subjectOf(span), body),
                        )
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {!isCoach && (
            <DeclareForm
              pending={pending}
              t={t}
              onInjury={(capacity, bother, name) => run(() => declareInjuryAction(capacity, bother, name))}
              onIllness={(bother) => run(() => declareIllnessAction(bother))}
            />
          )}

          {closed.length > 0 && (
            <details className="mt-6" data-history-fold="">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t('history')} ({closed.length})
              </summary>
              <ul className="mt-2 divide-y divide-border border border-border">
                {closed.map((span) => (
                  // Each past record is its own fold: one muted line, and the
                  // rest — glance, bother, the thread — on tap.
                  <li key={span.id} data-history={span.id}>
                    <details
                      data-record={span.id}
                      data-open="false"
                      className="px-3 py-2 opacity-70"
                      onToggle={(e) => {
                        if (e.currentTarget.open) setSelectedId(span.id);
                      }}
                    >
                      <summary className="cursor-pointer">
                        <RecordLine span={span} locale={locale} t={t} />
                      </summary>
                      <RecordGlance span={span} t={t} />
                      {selectedId === span.id && (
                        <Thread
                          subject={subjectOf(span)}
                          coachAthleteId={coachAthleteId}
                          pending={pending}
                          t={t}
                          onAdd={(body) =>
                            run(() =>
                              coachAthleteId
                                ? addHealthNoteAsCoachAction(coachAthleteId, subjectOf(span), body)
                                : addHealthNoteAction(subjectOf(span), body),
                            )
                          }
                        />
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </aside>
    </div>
  );
}

type T = ReturnType<typeof useTranslations<'HealthDrawer'>>;

function subjectOf(span: HealthSpan): HealthSubject {
  return span.kind === 'injury' ? { injuryId: span.id } : { illnessId: span.id };
}

/**
 * Which record the drawer opens on: the one clicked; else, opened from a
 * status, the newest open record of that kind; else the first open one.
 */
function initialSelection(state: HealthDrawerState, open: HealthSpan[]): string | null {
  if (!state.open) return null;
  if (state.id) return state.id;
  const ofKind = state.kind ? open.filter((s) => s.kind === state.kind) : open;
  const newest = [...ofKind].sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())[0];
  return newest?.id ?? open[0]?.id ?? null;
}

/** Line one: the name (or the kind) and the dates — "left knee · since 2 Sep". */
function RecordLine({ span, locale, t }: { span: HealthSpan; locale: string; t: T }) {
  const kindLabel = span.kind === 'illness' ? t('illnessLabel') : t('injuryLabel');
  return (
    <p className="font-body text-sm text-foreground">
      {span.name ?? kindLabel}
      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {t('since', { date: formatFullDate(span.from, locale) })}
        {span.to && ` — ${formatFullDate(span.to, locale)}`}
      </span>
    </p>
  );
}

/** Line two: what it prevents, and how much it bothers. Empty for an illness with no rating. */
function RecordGlance({ span, t }: { span: HealthSpan; t: T }) {
  const parts = span.capacity ? glanceParts(span.capacity) : [];
  if (parts.length === 0 && span.bother === null) return null;
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
      {parts.map((p) => t(`glance_${p.allowance}_${p.discipline}`)).join(' · ')}
      {span.bother !== null && `${parts.length > 0 ? ' · ' : ''}${t('botherLabel', { value: span.bother })}`}
    </p>
  );
}

/** The record as words: name and dates, then what it prevents and how much it bothers. */
function RecordSummary({ span, locale, t }: { span: HealthSpan; locale: string; t: T }) {
  return (
    <div>
      <RecordLine span={span} locale={locale} t={t} />
      <RecordGlance span={span} t={t} />
    </div>
  );
}

function RecordRow({
  span,
  selected,
  isCoach,
  pending,
  locale,
  t,
  canDelete,
  onSelect,
  onClose,
  onDelete,
  onBother,
}: {
  span: HealthSpan;
  selected: boolean;
  isCoach: boolean;
  pending: boolean;
  locale: string;
  t: T;
  /** Younger than 24 h and the athlete's own: "declared by mistake" is offered. */
  canDelete: boolean;
  onSelect: () => void;
  onClose: () => void;
  onDelete: () => void;
  onBother: (value: number | null) => void;
}) {
  return (
    <div className={['px-3 py-2', selected ? 'bg-background/60' : ''].join(' ')}>
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <RecordSummary span={span} locale={locale} t={t} />
      </button>
      {!isCoach && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <BotherControl value={span.bother} disabled={pending} t={t} onChange={onBother} />
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="border border-signal px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-signal transition-colors hover:bg-signal hover:text-signal-foreground disabled:opacity-50"
          >
            {span.kind === 'injury' ? t('imBack') : t('illnessOver')}
          </button>
          {canDelete && (
            <button
              type="button"
              data-action="delete"
              onClick={onDelete}
              disabled={pending}
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:opacity-50"
            >
              {t('declaredByMistake')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** "How much is it bothering you today?" — 1–5, optional, the athlete's only. */
function BotherControl({
  value,
  disabled,
  t,
  onChange,
}: {
  value: number | null;
  disabled: boolean;
  t: T;
  onChange: (value: number | null) => void;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {t('botherQuestion')}
      </p>
      <div className="mt-1 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            data-bother={n}
            disabled={disabled}
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={[
              'h-7 w-7 border font-mono text-[11px] transition-colors disabled:opacity-50',
              value === n
                ? 'border-signal text-signal'
                : 'border-border text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The detail thread: read on select, one form to add. Human eyes only. */
function Thread({
  subject,
  coachAthleteId,
  pending,
  t,
  onAdd,
}: {
  subject: HealthSubject;
  coachAthleteId?: string;
  pending: boolean;
  t: T;
  onAdd: (body: string) => void;
}) {
  const [notes, setNotes] = useState<HealthNoteRow[] | null>(null);
  const [draft, setDraft] = useState('');
  const key = 'injuryId' in subject ? subject.injuryId : subject.illnessId;

  useEffect(() => {
    let live = true;
    const read = coachAthleteId
      ? readHealthNotesAsCoachAction(coachAthleteId, subject)
      : readHealthNotesAction(subject);
    read.then((result) => {
      if (live) setNotes(result.ok ? result.notes : []);
    });
    return () => {
      live = false;
    };
    // The subject is identified by its id; a new object with the same id is the
    // same thread.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key, coachAthleteId]);

  return (
    <div className="border-t border-dashed border-border px-3 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {t('notesDivider')}
      </p>
      <ul className="mt-2 space-y-2">
        {(notes ?? []).map((note) => (
          <li key={note.id} className="font-body text-sm text-foreground">
            <span className="mr-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              {note.authorRole === 'head_coach' ? t('authorHeadCoach') : t('authorAthlete')}
            </span>
            {note.body}
          </li>
        ))}
      </ul>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        aria-label={t('addNote')}
        className="mt-2 w-full border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none focus:border-signal"
      />
      <button
        type="button"
        disabled={pending || draft.trim() === ''}
        onClick={() => {
          onAdd(draft);
          setDraft('');
        }}
        className="mt-2 border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {t('addNote')}
      </button>
    </div>
  );
}

/**
 * "What can you do right now?" — capacity, never diagnosis. Three disciplines,
 * three allowances, an optional Bother Rating; and Illness as one button. The
 * copy was decided on 2026-09-11 so the form cannot drift into asking what is
 * wrong: the name field (28a, Mads 2026-09-18) is "what and where" in the
 * athlete's words — "left knee" — to tell two injuries apart, never a
 * diagnosis, and never read by the planner.
 */
function DeclareForm({
  pending,
  t,
  onInjury,
  onIllness,
}: {
  pending: boolean;
  t: T;
  onInjury: (capacity: Capacity, bother: number | null, name: string) => void;
  onIllness: (bother: number | null) => void;
}) {
  const [capacity, setCapacity] = useState<Capacity>({ swim: 'full', bike: 'full', run: 'full' });
  const [bother, setBother] = useState<number | null>(null);
  const [name, setName] = useState('');
  const restricted = DISCIPLINES.some((d) => capacity[d] !== 'full');

  return (
    <section className="mt-6">
      <h2 className="font-display text-xl tracking-[0.04em] text-foreground">{t('whatCanYouDo')}</h2>
      <p className="mt-1 font-body text-xs text-muted-foreground">{t('whatCanYouDoNote')}</p>
      <div className="mt-3 space-y-2">
        {DISCIPLINES.map((d) => (
          <div key={d} data-discipline={d} className="flex items-center justify-between gap-3">
            <span className="font-body text-sm text-foreground">{t(`discipline_${d}`)}</span>
            <div className="flex gap-1">
              {[...ALLOWANCES].reverse().map((a: Allowance) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={capacity[d] === a}
                  onClick={() => setCapacity({ ...capacity, [d]: a })}
                  className={[
                    'border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors',
                    capacity[d] === a
                      ? 'border-signal text-signal'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {t(`allow${a[0].toUpperCase()}${a.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* What and where, in the athlete's words — a name to tell two injuries
          apart, not a diagnosis; optional, and never read by the planner. */}
      <div className="mt-3">
        <label htmlFor="health-injury-name" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {t('nameLabel')}
        </label>
        <input
          id="health-injury-name"
          data-field="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          maxLength={60}
          disabled={pending}
          className="mt-1 w-full border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-signal"
        />
      </div>
      <div className="mt-3">
        <BotherControl value={bother} disabled={pending} t={t} onChange={setBother} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !restricted}
          onClick={() => onInjury(capacity, bother, name)}
          className="border border-signal px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-signal transition-colors hover:bg-signal hover:text-signal-foreground disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent"
        >
          {t('declareInjury')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onIllness(bother)}
          className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {t('imIll')}
        </button>
      </div>
    </section>
  );
}
