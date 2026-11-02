'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { formatFullDate } from '@/lib/date';
import type { HealthNoteRow } from '@/db/schema';
import { ALLOWANCES, DISCIPLINES, type Allowance, type Capacity } from '@/features/health/capacity';
import { confirmationKey } from '@/features/health/delete-confirmation';
import { glanceParts, type HealthSpan } from '@/features/health/health-layer';
import { disclosureCopy } from '@/features/consent/disclosure';
import { grantConsentsAction } from './consent-actions';
import { ConfirmDelete } from './confirm-delete';
import { HEALTH_ICON } from './health-status-card';
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
  type DeclareActionResult,
  type HealthSubject,
} from './health-actions';
import {
  addHealthNoteAsCoachAction,
  readHealthNotesAsCoachAction,
} from './(app)/coach/athlete/[athleteId]/health-actions';

/**
 * Injuries and illness: the register of every record and the place to report
 * one (`training-architecture/06`, `showable-version/50`).
 *
 * Two roles, one drawer. The **athlete** reports (capacity, never diagnosis),
 * ends a record ("Injury over" / "Illness over", not "recovered", which is a
 * clinical judgment), rates how much it bothers them, notes, and deletes. The
 * **Head Coach** sees everything the athlete sees (Mads, 2026-09-11), titled
 * with the athlete's name, and may only add a note.
 *
 * Mads's ruling on 50 (2026-09-29): two counted sections, **Ongoing** and
 * **Past**, both expanded and with every record; for an athlete with none, one
 * sentence and the two ways to report, no headers. The design is Lovable's
 * (`.scratch/showable-version/lovable/50-health-drawer/`, 2026-11-01). A day's
 * calendar mark opens the drawer on its own record, past ones included (51).
 *
 * **The injury consent (training-architecture/14)** is asked inside the form:
 * when a declare action refuses with `consent-required`, the report stays in
 * the form, read-only, under the consent's own words; agreeing grants it and
 * repeats the same declaration, Not now gives the form back. The server is the
 * gate: the drawer remembers nothing about consent itself.
 *
 * The detail thread is for human eyes only (ADR 0011). It is fetched for the
 * opened record only, by the athlete's own action or the coach's link-gated
 * one; nothing on this path reaches a prompt (`detail-thread-never-prompts`
 * names this file as one of the few allowed to touch it).
 */
export type HealthDrawerState =
  | { open: false }
  | { open: true; kind?: 'injury' | 'illness'; id?: string };

type Kind = HealthSpan['kind'];
type T = ReturnType<typeof useTranslations<'HealthDrawer'>>;

export function HealthDrawer({
  state,
  spans,
  locale,
  onClose,
  coachAthleteId,
  athleteName,
}: {
  state: HealthDrawerState;
  /** Every span, ongoing and past; the drawer sorts them. */
  spans: HealthSpan[];
  locale: string;
  onClose: () => void;
  /** Set when the Head Coach is the one looking. Read-only except for notes. */
  coachAthleteId?: string;
  /** The athlete's name, for the coach's title. */
  athleteName?: string;
}) {
  const t = useTranslations('HealthDrawer');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  // The one record whose delete is waiting on its confirm tap, keyed by its
  // section so an ongoing record's confirm never arms a past row (28e).
  const [confirming, setConfirming] = useState<string | null>(null);
  const panelRef = useDialogFocus<HTMLElement>(onClose, state.open);
  const isCoach = Boolean(coachAthleteId);

  // Past is past, including a record ended today: the calendar draws `to`
  // inclusively so the band covers the last day, but the drawer must not keep
  // offering "Injury over" and the Bother Rating on it (CodeRabbit, PR #67).
  const ongoing = spans.filter((s) => s.to === null);
  const past = spans.filter((s) => s.to !== null);
  const [selectedId, setSelectedId] = useState<string | null>(() => initialSelection(state, ongoing));
  const [form, setForm] = useState<Kind | null>(null);
  // The declaration waiting on the injury consent: kept so agreeing repeats
  // exactly what the athlete asked for.
  const [consentFor, setConsentFor] = useState<{ kind: Kind; retry: () => Promise<DeclareActionResult> } | null>(null);

  useEffect(() => {
    if (!state.open || !selectedId) return;
    requestAnimationFrame(() => document.getElementById(`health-record-${selectedId}`)?.scrollIntoView?.({ block: 'start' }));
    // Only on opening: scrolling again on every selection would jump the list.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open]);

  if (!state.open) return null;

  function finish(result: { ok: boolean }) {
    if (!result.ok) return setFailed(true);
    setConsentFor(null);
    setForm(null);
    router.refresh();
  }

  function declare(kind: Kind, action: () => Promise<DeclareActionResult>) {
    setFailed(false);
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false as const, reason: 'invalid' as const }));
      if (!result.ok && result.reason === 'consent-required') return setConsentFor({ kind, retry: action });
      finish(result);
    });
  }

  /** Grants the consent first; only a grant that landed declares again. */
  function agreeAndDeclare() {
    const waiting = consentFor;
    if (!waiting) return;
    setFailed(false);
    startTransition(async () => {
      const granted = await grantConsentsAction(['injury_health_data']).catch(() => ({ ok: false as const }));
      finish(granted.ok ? await waiting.retry().catch(() => ({ ok: false as const })) : granted);
    });
  }

  function run(action: () => Promise<{ ok: boolean }>) {
    setFailed(false);
    startTransition(async () => {
      // A rejected action (network, server) is an error like a refused one:
      // without the catch the drawer shows nothing (CodeRabbit, PR #86).
      const result = await action().catch(() => ({ ok: false as const }));
      if (!result.ok) setFailed(true);
      else router.refresh();
    });
  }

  const title = isCoach && athleteName ? t('titleFor', { name: athleteName }) : t('title');
  const consent = consentFor ? disclosureCopy(locale).purposes.injury_health_data : null;

  const renderRecord = (span: HealthSpan) => (
    <RecordCard
      key={span.id}
      span={span}
      selected={selectedId === span.id}
      isCoach={isCoach}
      pending={pending}
      locale={locale}
      t={t}
      confirmKey={confirmationKey(span.to === null ? 'open' : 'history', span.id)}
      confirming={confirming}
      onSelect={() => setSelectedId(span.id)}
      onEnd={() => run(() => (span.kind === 'injury' ? closeInjuryAction(span.id) : closeIllnessAction(span.id)))}
      onAskDelete={(key) => setConfirming(key)}
      onDelete={() => run(() => deleteOf(span))}
      onBother={(value) => run(() => setBotherAction(subjectOf(span), value))}
      thread={
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
      }
    />
  );

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={t('close')}
        disabled={pending && Boolean(consentFor)}
        onClick={onClose}
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[1px]"
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l-4 border-signal bg-background shadow-2xl outline-none"
      >
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-2xl font-bold uppercase italic tracking-[0.04em] text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="inline-flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-6">
          {failed && (
            <p role="alert" className="border-l-4 border-destructive bg-panel px-4 py-3 font-body text-base text-foreground">
              {t('error')}
            </p>
          )}

          {spans.length === 0 && (
            <p className="font-body text-base text-foreground">{isCoach ? t('emptyCoach') : t('empty')}</p>
          )}

          {!isCoach && (
            <Report
              form={form}
              pending={pending}
              t={t}
              consent={consent && consentFor ? { kind: consentFor.kind, ...consent } : null}
              onToggle={(kind) => {
                setConsentFor(null);
                setForm(form === kind ? null : kind);
              }}
              onCancel={() => {
                setConsentFor(null);
                setForm(null);
              }}
              onInjury={(capacity, bother, name) => declare('injury', () => declareInjuryAction(capacity, bother, name))}
              onIllness={(bother) => declare('illness', () => declareIllnessAction(bother))}
              onAgree={agreeAndDeclare}
              onNotNow={() => setConsentFor(null)}
            />
          )}

          {spans.length > 0 && (
            <>
              <Section label={t('ongoing')} count={ongoing.length}>
                {ongoing.map(renderRecord)}
              </Section>
              <Section label={t('past')} count={past.length}>
                {past.map(renderRecord)}
              </Section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Deletes the record for good, whatever its age (28e). The athlete's only. */
function deleteOf(span: HealthSpan) {
  return span.kind === 'injury' ? deleteInjuryAction(span.id) : deleteIllnessAction(span.id);
}

function subjectOf(span: HealthSpan): HealthSubject {
  return span.kind === 'injury' ? { injuryId: span.id } : { illnessId: span.id };
}

/**
 * Which record the drawer opens on: the one a mark or a row named, ongoing or
 * past (51); else, opened from the status card, the newest ongoing record of
 * that kind; else the first ongoing one.
 */
function initialSelection(state: HealthDrawerState, ongoing: HealthSpan[]): string | null {
  if (!state.open) return null;
  if (state.id) return state.id;
  const ofKind = state.kind ? ongoing.filter((s) => s.kind === state.kind) : ongoing;
  const newest = [...ofKind].sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())[0];
  return newest?.id ?? ongoing[0]?.id ?? null;
}

/** A counted section, "Ongoing (1)", shown even when empty, once any record exists. */
function Section({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-3 font-display text-base font-bold uppercase italic tracking-[0.08em] text-foreground">
        {label}
        <span className="font-mono text-sm not-italic text-muted-foreground">({count})</span>
        <span className="h-px flex-1 bg-border" />
      </h3>
      {count > 0 && <ul className="space-y-3">{children}</ul>}
    </section>
  );
}

function RecordCard({
  span,
  selected,
  isCoach,
  pending,
  locale,
  t,
  confirmKey,
  confirming,
  onSelect,
  onEnd,
  onAskDelete,
  onDelete,
  onBother,
  thread,
}: {
  span: HealthSpan;
  selected: boolean;
  isCoach: boolean;
  pending: boolean;
  locale: string;
  t: T;
  confirmKey: string;
  confirming: string | null;
  onSelect: () => void;
  onEnd: () => void;
  onAskDelete: (key: string) => void;
  onDelete: () => void;
  onBother: (value: number | null) => void;
  /** The detail thread, rendered for the opened record only. */
  thread: ReactNode;
}) {
  const isOngoing = span.to === null;
  const KindIcon = HEALTH_ICON[span.kind];
  return (
    <li
      id={`health-record-${span.id}`}
      data-record={span.id}
      data-open={isOngoing ? 'true' : 'false'}
      data-selected={selected ? span.id : undefined}
      className={['scroll-mt-4 border border-border bg-panel', selected ? 'ring-2 ring-signal' : ''].join(' ')}
    >
      <button type="button" onClick={onSelect} className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left">
        <span
          className={[
            'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center',
            isOngoing
              ? span.kind === 'injury'
                ? 'bg-signal text-signal-foreground'
                : 'bg-foreground text-background'
              : 'border border-border text-muted-foreground',
          ].join(' ')}
        >
          <KindIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-display text-lg font-bold uppercase italic leading-tight tracking-[0.03em] text-foreground">
              {span.name ?? (span.kind === 'injury' ? t('injuryLabel') : t('illnessLabel'))}
            </span>
            <span className="shrink-0 font-mono text-xs uppercase text-muted-foreground">
              {t('since', { date: formatFullDate(span.from, locale) })}
              {span.to && ` — ${formatFullDate(span.to, locale)}`}
            </span>
          </span>
          <Glance span={span} showBother={isCoach || !isOngoing} t={t} />
        </span>
      </button>

      <div className="space-y-4 px-4 py-4">
        {isOngoing && !isCoach && (
          <BotherScale label={t('botherToday')} value={span.bother} disabled={pending} t={t} onChange={onBother} />
        )}

        {selected && thread}

        {!isCoach && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {isOngoing && (
              <button
                type="button"
                onClick={onEnd}
                disabled={pending}
                className="inline-flex h-10 items-center border border-foreground px-4 font-body text-[15px] text-foreground transition-colors hover:bg-foreground hover:text-background disabled:opacity-50"
              >
                {span.kind === 'injury' ? t('injuryOver') : t('illnessOver')}
              </button>
            )}
            {/* Any age (28e): the 24 h window is gone. */}
            <ConfirmDelete
              action={isOngoing ? 'delete' : 'remove'}
              label={isOngoing ? t('declaredByMistake') : t('removeFromHistory')}
              confirmLabel={t('confirmRemove')}
              confirming={confirming === confirmKey}
              disabled={pending}
              onAsk={() => onAskDelete(confirmKey)}
              onConfirm={onDelete}
            />
          </div>
        )}
      </div>
    </li>
  );
}

/** What the record prevents ("easy bike · no run") and, where no scale shows it, how much it bothers. */
function Glance({ span, showBother, t }: { span: HealthSpan; showBother: boolean; t: T }) {
  const parts = span.capacity ? glanceParts(span.capacity).map((p) => t(`glance_${p.allowance}_${p.discipline}`)) : [];
  if (showBother && span.bother !== null) parts.push(t('botherLabel', { value: span.bother }));
  if (parts.length === 0) return null;
  return <span className="mt-0.5 block font-body text-sm text-muted-foreground">{parts.join(' · ')}</span>;
}

/** 1–5, optional; tapping the chosen value again clears it. The athlete's only. */
function BotherScale({
  label,
  value,
  disabled,
  t,
  onChange,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  t: T;
  onChange: (value: number | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="flex items-baseline justify-between">
        <span className="font-body text-sm text-muted-foreground">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{value ? `${value} / 5` : '– / 5'}</span>
      </div>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            data-bother={n}
            aria-checked={value === n}
            aria-label={`${n}`}
            disabled={disabled}
            onClick={() => onChange(value === n ? null : n)}
            className={[
              'flex h-10 flex-1 items-end justify-start border px-2 pb-1 font-mono text-xs transition-colors disabled:cursor-default',
              value !== null && n <= value
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-transparent text-muted-foreground hover:border-foreground',
            ].join(' ')}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-body text-xs text-muted-foreground">
        <span>{t('botherLow')}</span>
        <span>{t('botherHigh')}</span>
      </div>
    </div>
  );
}

/** The detail thread: read on opening the record, one form to add. Human eyes only. */
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
    <div>
      <span className="font-body text-xs uppercase tracking-[0.14em] text-muted-foreground">{t('notesDivider')}</span>
      {notes && notes.length > 0 && (
        <ul className="mt-2 space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="border-l-2 border-border pl-3">
              <span className="font-mono text-[11px] uppercase text-muted-foreground">
                {note.authorRole === 'head_coach' ? t('authorHeadCoach') : t('authorAthlete')}
              </span>
              <p className="font-body text-sm text-foreground">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={t('addNote')}
          className="h-10 min-w-0 flex-1 border border-border bg-background px-3 font-body text-base text-foreground outline-none focus:border-signal"
        />
        <button
          type="button"
          disabled={pending || draft.trim() === ''}
          onClick={() => {
            onAdd(draft);
            setDraft('');
          }}
          className="inline-flex h-10 items-center border border-border px-4 font-body text-[15px] text-foreground transition-colors hover:border-foreground disabled:opacity-40"
        >
          {t('addNote')}
        </button>
      </div>
    </div>
  );
}

/**
 * The two ways to report, as entry cards that open their own form. Capacity,
 * never diagnosis: the copy was decided on 2026-09-11 so the form cannot drift
 * into asking what is wrong, and the name (28a) is "what and where" in the
 * athlete's words — "left knee" — to tell two injuries apart, never a
 * diagnosis, and never read by the planner.
 */
function Report({
  form,
  pending,
  t,
  consent,
  onToggle,
  onCancel,
  onInjury,
  onIllness,
  onAgree,
  onNotNow,
}: {
  form: Kind | null;
  pending: boolean;
  t: T;
  /** Set while a report waits on the injury consent: its form shows the consent's words. */
  consent: { kind: Kind; title: string; body: string } | null;
  onToggle: (kind: Kind) => void;
  onCancel: () => void;
  onInjury: (capacity: Capacity, bother: number | null, name: string) => void;
  onIllness: (bother: number | null) => void;
  onAgree: () => void;
  onNotNow: () => void;
}) {
  const [capacity, setCapacity] = useState<Capacity>({ swim: 'full', bike: 'full', run: 'full' });
  const [bother, setBother] = useState<number | null>(null);
  const [name, setName] = useState('');
  // Each opened form starts blank: a saved report must not come back
  // pre-filled, inviting the same declaration twice.
  const [openedFor, setOpenedFor] = useState(form);
  if (form !== openedFor) {
    setOpenedFor(form);
    setCapacity({ swim: 'full', bike: 'full', run: 'full' });
    setBother(null);
    setName('');
  }
  const restricted = DISCIPLINES.some((d) => capacity[d] !== 'full');
  const frozen = Boolean(consent) || pending;

  const panel = (kind: Kind) =>
    consent?.kind === kind ? (
      <ConsentPanel title={consent.title} body={consent.body} pending={pending} t={t} onAgree={onAgree} onNotNow={onNotNow} />
    ) : null;

  const actions = (kind: Kind, save: ReactNode) => (
    <div className="flex items-center gap-2 border-t border-border pt-4">
      {consent?.kind !== kind && save}
      <button
        type="button"
        disabled={pending}
        onClick={onCancel}
        className="inline-flex h-11 items-center px-4 font-body text-[15px] text-muted-foreground hover:text-foreground"
      >
        {t('cancel')}
      </button>
    </div>
  );

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <EntryCard kind="injury" open={form === 'injury'} dim={form === 'illness'} disabled={frozen} t={t} onToggle={onToggle} />
        <EntryCard kind="illness" open={form === 'illness'} dim={form === 'injury'} disabled={frozen} t={t} onToggle={onToggle} />
      </div>

      {form === 'injury' && (
        <div className="space-y-5 border-2 border-t-0 border-signal bg-panel p-5">
          <fieldset disabled={frozen} className="space-y-5">
            <label className="block">
              <span className="font-body text-sm text-muted-foreground">{t('nameLabel')}</span>
              <input
                data-field="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                readOnly={frozen}
                placeholder={t('namePlaceholder')}
                maxLength={60}
                className="mt-1.5 h-11 w-full border border-border bg-background px-3 font-body text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-signal"
              />
            </label>
            <CapacityGrid value={capacity} t={t} onChange={setCapacity} />
            <BotherScale label={t('botherQuestion')} value={bother} disabled={frozen} t={t} onChange={setBother} />
          </fieldset>
          {panel('injury')}
          {actions(
            'injury',
            <button
              type="button"
              disabled={!restricted || pending}
              onClick={() => onInjury(capacity, bother, name)}
              className="inline-flex h-11 flex-1 items-center justify-center bg-signal px-4 font-body text-base font-medium text-signal-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {t('saveInjury')}
            </button>,
          )}
        </div>
      )}

      {form === 'illness' && (
        <div className="space-y-5 border-2 border-t-0 border-foreground bg-panel p-5">
          <fieldset disabled={frozen} className="space-y-5">
            <p className="font-body text-base text-foreground">{t('illExplain')}</p>
            <BotherScale label={t('botherQuestion')} value={bother} disabled={frozen} t={t} onChange={setBother} />
          </fieldset>
          {panel('illness')}
          {actions(
            'illness',
            <button
              type="button"
              disabled={pending}
              onClick={() => onIllness(bother)}
              className="inline-flex h-11 flex-1 items-center justify-center bg-foreground px-4 font-body text-base font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {t('saveIllness')}
            </button>,
          )}
        </div>
      )}
    </section>
  );
}

function EntryCard({
  kind,
  open,
  dim,
  disabled,
  t,
  onToggle,
}: {
  kind: Kind;
  open: boolean;
  dim: boolean;
  disabled: boolean;
  t: T;
  onToggle: (kind: Kind) => void;
}) {
  const injury = kind === 'injury';
  const Icon = HEALTH_ICON[kind];
  return (
    <button
      type="button"
      aria-expanded={open}
      disabled={disabled}
      onClick={() => onToggle(kind)}
      className={[
        'flex min-h-24 flex-col items-start gap-1 border-2 p-4 text-left transition-colors',
        open
          ? injury
            ? 'border-signal bg-signal text-signal-foreground'
            : 'border-foreground bg-foreground text-background'
          : injury
            ? 'border-signal bg-panel text-foreground hover:bg-signal/10'
            : 'border-border bg-panel text-foreground hover:border-foreground',
        dim ? 'opacity-50' : '',
      ].join(' ')}
    >
      <Icon className={open || !injury ? 'h-5 w-5' : 'h-5 w-5 text-signal'} />
      <span className="font-display text-lg font-bold uppercase italic leading-tight tracking-[0.03em]">
        {injury ? t('reportInjury') : t('ill')}
      </span>
      <span className={['font-body text-sm', open ? 'opacity-90' : 'text-muted-foreground'].join(' ')}>
        {injury ? t('reportInjurySub') : t('illSub')}
      </span>
    </button>
  );
}

/** "What can you train right now?": three disciplines, three allowances. */
function CapacityGrid({ value, t, onChange }: { value: Capacity; t: T; onChange: (value: Capacity) => void }) {
  return (
    <div>
      <span className="font-body text-sm text-muted-foreground">{t('trainLabel')}</span>
      <div className="mt-2 divide-y divide-border border border-border">
        {DISCIPLINES.map((d) => (
          <div key={d} data-discipline={d} className="grid grid-cols-[64px_1fr] items-center">
            <span className="px-3 font-display text-sm font-bold uppercase italic tracking-[0.08em] text-foreground">
              {t(`discipline_${d}`)}
            </span>
            <div className="grid grid-cols-3 border-l border-border" role="radiogroup" aria-label={t(`discipline_${d}`)}>
              {[...ALLOWANCES].reverse().map((a: Allowance) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={value[d] === a}
                  onClick={() => onChange({ ...value, [d]: a })}
                  className={[
                    'h-10 border-l border-border px-1 font-body text-sm transition-colors first:border-l-0',
                    value[d] === a
                      ? a === 'full'
                        ? 'bg-foreground text-background'
                        : 'bg-signal text-signal-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {t(`allow${a[0].toUpperCase()}${a.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The `injury_health_data` consent, inside the form that asked for it
 * (training-architecture/14, ADR 0012). The words are the disclosure's own, so
 * what is shown is what is agreed to.
 */
function ConsentPanel({
  title,
  body,
  pending,
  t,
  onAgree,
  onNotNow,
}: {
  title: string;
  body: string;
  pending: boolean;
  t: T;
  onAgree: () => void;
  onNotNow: () => void;
}) {
  // Save held focus and is gone now; without this, focus falls to the page
  // and the next Tab leaves the drawer.
  const panel = useRef<HTMLElement>(null);
  useEffect(() => panel.current?.focus(), []);
  return (
    <section ref={panel} tabIndex={-1} data-injury-consent="" aria-busy={pending} className="space-y-3 border border-input bg-background p-4">
      <h3 className="font-body text-base font-semibold leading-snug text-foreground">{title}</h3>
      <p className="font-body text-base leading-relaxed text-foreground">{body}</p>
      <div className="flex flex-col gap-2 pt-1 min-[380px]:flex-row min-[380px]:items-center">
        <button
          type="button"
          disabled={pending}
          onClick={onAgree}
          className="inline-flex h-11 min-w-0 flex-1 items-center justify-center bg-signal px-3 font-body text-base text-signal-foreground hover:bg-signal/90 disabled:opacity-40"
        >
          {t('consentAgreeAndDeclare')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onNotNow}
          className="inline-flex h-10 items-center border border-border bg-transparent px-3 font-body text-base text-foreground disabled:opacity-40"
        >
          {t('consentNotNow')}
        </button>
      </div>
    </section>
  );
}
