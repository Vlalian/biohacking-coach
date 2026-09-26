'use client';

import { useTranslations } from 'next-intl';
import { Bandage, Pill, type LucideIcon } from 'lucide-react';
import { currentStatus, type HealthSpan } from '@/features/health/health-layer';

/** The one icon per record kind, shared by this card and the calendar's day marks. */
export const HEALTH_ICON: Record<'injury' | 'illness', LucideIcon> = { injury: Bandage, illness: Pill };

/**
 * The athlete's health today, once, above the calendar (`showable-version/28e`,
 * Mads 2026-09-19). It replaced a status line repeated on every week row.
 *
 * Two lines: "Uninjured · Healthy", muted, on a clean day; "Injured: left knee"
 * in signal while an injury is open. Each line opens the Health Drawer on that
 * kind. It says nothing about the past — history is the muted marks on the
 * days and the drawer's History fold. Muted, never red: no alarm, no demand
 * for an explanation.
 *
 * The caller renders it only when the layer is shared. For a Head Coach the
 * athlete withholds reports from, "uninjured" would be a claim nobody made
 * (`showable-version/28b`).
 */
export function HealthStatusCard({
  spans,
  onOpen,
}: {
  spans: readonly HealthSpan[];
  onOpen: (kind: 'injury' | 'illness') => void;
}) {
  const t = useTranslations('Calendar');
  const { injury, illness } = currentStatus(spans);
  const injuryLabel = injury
    ? injury.name
      ? `${t('statusInjured')}: ${injury.name}`
      : t('statusInjured')
    : t('statusUninjured');

  return (
    <div
      data-health-status=""
      className="flex w-max max-w-full flex-col gap-1 border border-border bg-panel px-3 py-2"
    >
      <StatusLine kind="injury" active={injury !== null} label={injuryLabel} onClick={() => onOpen('injury')} />
      <StatusLine
        kind="illness"
        active={illness !== null}
        label={illness ? t('statusIll') : t('statusHealthy')}
        onClick={() => onOpen('illness')}
      />
    </div>
  );
}

/** One line: icon + words, in signal while a record of that kind is open. */
function StatusLine({
  kind,
  active,
  label,
  onClick,
}: {
  kind: 'injury' | 'illness';
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = HEALTH_ICON[kind];
  return (
    <button
      type="button"
      data-status={kind}
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      className={[
        'inline-flex min-h-8 items-center gap-1.5 text-left font-body text-[13px] font-semibold uppercase tracking-[0.14em] transition-colors hover:text-foreground',
        active ? 'text-signal' : 'text-muted-foreground',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}
