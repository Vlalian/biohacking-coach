'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { HoursChangePreview, StartFrom } from '@/features/coach/hours-change';
import { addDays, isoWeekNumber } from '@/lib/date';
import { COACH_EXPECTED_SECONDS } from '@/lib/generation';

/** The signal-red outlined button every choice in this dialog uses. */
const SIGNAL_BUTTON =
  'border border-signal h-11 px-4 font-body text-base font-semibold text-foreground transition-colors hover:bg-signal hover:text-signal-foreground disabled:opacity-50';

/**
 * The hours confirm dialog (showable-version/61): what an hours change will do,
 * and — when a drafted week is waiting — which week the new hours start from.
 * Weeks are named by their ISO number, the way the calendar's gutter names them.
 * Built on the confirm box this Settings field already had; its look is not new.
 */
type Props = {
  hours: number;
  preview: HoursChangePreview;
  pending: boolean;
  onApply: (startFrom: StartFrom) => void;
  onRetry: () => void;
  onCancel: () => void;
};

const week = (mondayKey: string) => isoWeekNumber(mondayKey);
/** The week after, by date: after week 52 or 53 comes week 1, not 53 or 54. */
const weekAfter = (mondayKey: string) => week(addDays(mondayKey, 7));

export function HoursChangeDialog(props: Props) {
  const t = useTranslations('Settings');
  return (
    <div className="mt-3 border border-signal/40 bg-signal/5 p-4">
      <p className="font-body text-sm text-foreground">{t('hoursConfirmTitle', { hours: props.hours })}</p>
      <Body {...props} />
    </div>
  );
}

function Body(props: Props) {
  switch (props.preview.kind) {
    case 'drafting':
      return <Drafting {...props} week={props.preview.week} />;
    case 'choose':
      return <Choose {...props} preview={props.preview} />;
    case 'coach-preparing':
      return <CoachPreparing {...props} preview={props.preview} />;
    case 'confirm':
      return <Confirm {...props} preview={props.preview} />;
  }
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-1 font-body text-[13px] text-muted-foreground">{children}</p>;
}

function Choice({ label, note, onClick, pending }: { label: string; note?: string; onClick: () => void; pending: boolean }) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`inline-flex items-center gap-2 ${SIGNAL_BUTTON}`}
      >
        {pending && <Loader2 className="h-3 w-3 animate-spin" />}
        {label}
      </button>
      {note && <Note>{note}</Note>}
    </div>
  );
}

function Cancel({ onCancel, pending }: Pick<Props, 'onCancel' | 'pending'>) {
  const t = useTranslations('Settings');
  return (
    <button
      type="button"
      onClick={onCancel}
      disabled={pending}
      className="mt-3 border border-border h-11 px-4 font-body text-base font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      {t('hoursCancel')}
    </button>
  );
}

/** The redrawn weeks as a sentence: none, one, or a first–last range. */
function RedrawLine({ weeks, hours }: { weeks: string[]; hours: number }) {
  const t = useTranslations('Settings');
  if (weeks.length === 0) return <Note>{t('hoursNothingToRedraw')}</Note>;
  return (
    <Note>{t('hoursRedrawWeeks', { count: weeks.length, first: week(weeks[0]), last: week(weeks[weeks.length - 1]), hours })}</Note>
  );
}

function Drafting({ week: drafting, onRetry, onCancel, pending }: Props & { week: string }) {
  const t = useTranslations('Settings');
  return (
    <>
      <Note>{t('hoursDrafting', { week: week(drafting), seconds: COACH_EXPECTED_SECONDS })}</Note>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={pending}
          className={`mt-3 ${SIGNAL_BUTTON}`}
        >
          {t('hoursTryAgain')}
        </button>
        <Cancel onCancel={onCancel} pending={pending} />
      </div>
    </>
  );
}

function Choose({ preview, hours, onApply, onCancel, pending }: Props & { preview: Extract<HoursChangePreview, { kind: 'choose' }> }) {
  const t = useTranslations('Settings');
  const waiting = week(preview.waitingWeek);
  return (
    <>
      <Note>{t('hoursWaitingDraft', { week: waiting })}</Note>
      <Choice
        label={t('hoursStartFrom', { week: waiting })}
        note={t('hoursStartFromWaitingNote', {
          first: week(preview.weeks[0]),
          last: week(preview.weeks[preview.weeks.length - 1]),
          hours,
          week: waiting,
        })}
        onClick={() => onApply('waiting-week')}
        pending={pending}
      />
      <Choice
        label={t('hoursStartFrom', { week: weekAfter(preview.waitingWeek) })}
        note={t('hoursKeptNote', { week: waiting, hours })}
        onClick={() => onApply('week-after')}
        pending={pending}
      />
      <Cancel onCancel={onCancel} pending={pending} />
    </>
  );
}

function CoachPreparing({ preview, hours, onApply, onCancel, pending }: Props & { preview: Extract<HoursChangePreview, { kind: 'coach-preparing' }> }) {
  const t = useTranslations('Settings');
  const waiting = week(preview.waitingWeek);
  return (
    <>
      <Note>{t('hoursCoachPreparing', { week: waiting, after: weekAfter(preview.waitingWeek) })}</Note>
      <RedrawLine weeks={preview.weeks} hours={hours} />
      <Choice label={t('hoursStartFrom', { week: weekAfter(preview.waitingWeek) })} onClick={() => onApply('week-after')} pending={pending} />
      <Cancel onCancel={onCancel} pending={pending} />
    </>
  );
}

function Confirm({ preview, hours, onApply, onCancel, pending }: Props & { preview: Extract<HoursChangePreview, { kind: 'confirm' }> }) {
  const t = useTranslations('Settings');
  return (
    <>
      {preview.plannedWeek && <Note>{t('hoursPlannedStays', { week: week(preview.plannedWeek) })}</Note>}
      <RedrawLine weeks={preview.weeks} hours={hours} />
      <div className="flex gap-2">
        {/* No draft is waiting, so where the change starts does not matter. */}
        <button
          type="button"
          onClick={() => onApply('week-after')}
          disabled={pending}
          className={`mt-3 inline-flex items-center gap-2 ${SIGNAL_BUTTON}`}
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          {t('hoursConfirm')}
        </button>
        <Cancel onCancel={onCancel} pending={pending} />
      </div>
    </>
  );
}
