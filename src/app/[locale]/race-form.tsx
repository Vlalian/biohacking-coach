'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RACE_DISTANCES } from '@/lib/race-distances';
import { ActionButton } from './action-button';

/** Target or Tune-up, as the athlete chooses it. A Tune-up Race is stored as a non-target. */
export type RaceFormKind = 'target' | 'tune-up';

/** What the form hands its caller: the race, and whether it is to be the Target Race. */
export interface RaceFormInput {
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  distance: string;
  asTarget: boolean;
}

/**
 * The one race form (`training-architecture/37`, ruling 1): Settings' add form
 * and a calendar day's "+" both render this. Name, date, distance, and Target
 * or Tune-up.
 *
 * Choosing Target while a Target Race exists **replaces** it (Mads,
 * 2026-09-29), so the form says so by name and asks for a tick before it will
 * add. The old target is not deleted: it stays a race, and is a tune-up if it
 * falls before the new one — the server's rule, not this form's.
 *
 * The copy lives in the `Settings` catalogue, where the form was born; it is
 * one form, so it keeps one set of words.
 */
export function RaceForm({
  defaultDate = '',
  currentTarget,
  defaultKind,
  disabled,
  onAdd,
}: {
  /** The day the form was opened from; empty in Settings. */
  defaultDate?: string;
  /** The athlete's Target Race, or null when they have none. */
  currentTarget: { name: string } | null;
  /**
   * Which kind the form starts on. Absent, it is Target when there is none to
   * replace and Tune-up beside one, so a replace is always a choice.
   */
  defaultKind?: RaceFormKind;
  disabled: boolean;
  /** Resolves true when the race was added, which clears the form. */
  onAdd: (input: RaceFormInput) => Promise<boolean>;
}) {
  const t = useTranslations('Settings');
  const [name, setName] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [distance, setDistance] = useState<string>(RACE_DISTANCES[3]);
  const [kind, setKind] = useState<RaceFormKind>(defaultKind ?? (currentTarget ? 'tune-up' : 'target'));
  const [confirmed, setConfirmed] = useState(false);

  const replaces = kind === 'target' && currentTarget !== null;
  const canAdd = name.trim() !== '' && date !== '' && !disabled && (!replaces || confirmed);

  async function add() {
    if (await onAdd({ name, date, distance, asTarget: kind === 'target' })) {
      setName('');
      setDate(defaultDate);
      setConfirmed(false);
    }
  }

  return (
    <div className="mt-3">
      <p className="font-body text-sm uppercase tracking-[0.16em] text-muted-foreground">
        {t('racesAddLabel')}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('raceTargetPlaceholder')}
          maxLength={120}
          aria-label={t('raceTargetLabel')}
          className="w-full border border-border bg-background px-3 py-2.5 font-body text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-signal"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label={t('raceDateLabel')}
          className="border border-border bg-background px-3 py-2.5 font-body text-base text-foreground outline-none focus:border-signal"
        />
        <select
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          aria-label={t('raceDistanceLabel')}
          className="border border-border bg-background px-3 py-2.5 font-body text-base text-foreground outline-none focus:border-signal"
        >
          {RACE_DISTANCES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div role="group" aria-label={t('racesKindLabel')} className="mt-2 flex flex-wrap gap-2">
        {(['target', 'tune-up'] as const).map((k) => (
          <button
            key={k}
            type="button"
            data-race-kind-choice={k}
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setConfirmed(false);
            }}
            className={[
              'h-10 border px-4 font-body text-[15px] font-medium transition-colors',
              kind === k
                ? 'border-signal bg-signal text-signal-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t(k === 'target' ? 'racesKindTarget' : 'racesKindTuneUp')}
          </button>
        ))}
      </div>

      {replaces && (
        <div className="mt-2 border border-signal/60 bg-signal/5 px-3 py-2">
          <p className="font-body text-sm text-foreground">
            {t('racesReplacesTarget', { name: currentTarget.name })}
          </p>
          <label className="mt-1 flex items-center gap-2 font-body text-sm text-foreground">
            <input
              type="checkbox"
              data-confirm-replace=""
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="h-4 w-4 accent-signal"
            />
            {t('racesConfirmReplace')}
          </label>
        </div>
      )}

      <div className="mt-2">
        <ActionButton onClick={add} disabled={!canAdd} label={t('racesAdd')} pending={disabled} />
      </div>
    </div>
  );
}
