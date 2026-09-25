'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { RACE_DISTANCES } from '@/lib/race-distances';
import type { AddRaceResult, SettingsActionResult } from './settings-actions';
import { useSave } from './use-save';

/**
 * The athlete's Races (`training-architecture/09`): several, one of them the
 * Target Race, chosen rather than derived.
 *
 * Replaces the single name+date field slice 02 shipped. Its own file rather
 * than another function in `settings-view.tsx`, which is already the longest
 * component in the app — and because the section carries three actions, not a
 * save, so none of that file's save-status helpers fit it.
 *
 * Each Race carries its own distance: a tune-up is usually a different distance
 * from the one being trained for, so the add form asks. Editing a race is
 * remove-and-add — the two operations that exist, rather than a third.
 */
export interface SettingsRace {
  id: string;
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  distance: string;
  isTarget: boolean;
}

export function RacesSection({
  races,
  onAdd,
  onSetTarget,
  onRemove,
}: {
  races: SettingsRace[];
  onAdd: (name: string, date: string, distance: string) => Promise<AddRaceResult>;
  onSetTarget: (raceId: string) => Promise<SettingsActionResult>;
  onRemove: (raceId: string) => Promise<SettingsActionResult>;
}) {
  const t = useTranslations('Settings');
  // Local truth after each action, because the actions do not revalidate the
  // route — the same baseline rule the other fields follow.
  const [current, setCurrent] = useState(races);
  const { pending, error, run } = useSave();

  async function makeTarget(id: string) {
    if (await run(() => onSetTarget(id))) {
      setCurrent((prev) => prev.map((r) => ({ ...r, isTarget: r.id === id })));
    }
  }

  async function remove(id: string) {
    if (await run(() => onRemove(id))) {
      setCurrent((prev) => prev.filter((r) => r.id !== id));
    }
  }

  return (
    <div>
      <p className="font-body text-sm uppercase tracking-[0.16em] text-muted-foreground">
        {t('racesLabel')}
      </p>
      <p className="mt-1 font-body text-[13px] text-muted-foreground">{t('racesNote')}</p>

      {current.length === 0 ? (
        <p className="mt-2 font-body text-sm text-muted-foreground">{t('racesNone')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border border border-border">
          {[...current]
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
            .map((race) => (
              <li key={race.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm text-foreground">
                    {race.name}
                    {race.isTarget && (
                      <span className="ml-2 border border-signal px-1.5 py-0.5 font-body text-[13px] uppercase tracking-[0.16em] text-signal">
                        {t('racesTargetBadge')}
                      </span>
                    )}
                  </p>
                  <p className="font-body text-sm uppercase tracking-[0.16em] text-muted-foreground">
                    {race.date} · {race.distance}
                  </p>
                </div>
                {!race.isTarget && (
                  <ActionButton
                    onClick={() => makeTarget(race.id)}
                    disabled={pending}
                    label={t('racesMakeTarget')}
                  />
                )}
                <ActionButton
                  onClick={() => remove(race.id)}
                  disabled={pending}
                  label={t('racesRemove')}
                  quiet
                />
              </li>
            ))}
        </ul>
      )}

      <AddRaceForm
        onAdd={async (name, date, distance) => {
          // The persisted id, captured from the result the save hook only
          // reads `ok` from — so remove and make-target work on the new race
          // at once, with no reload (CodeRabbit, PR #67).
          const created = { id: null as string | null };
          const ok = await run(async () => {
            const result = await onAdd(name, date, distance);
            if (result.ok) created.id = result.raceId;
            return result;
          });
          if (ok && created.id !== null) {
            // The server decides whether this became the target (it does when
            // there was none); mirror that rule so the badge is right without a
            // reload.
            const first = current.every((r) => !r.isTarget);
            const id = created.id;
            setCurrent((prev) => [...prev, { id, name, date, distance, isTarget: first }]);
          }
          return ok;
        }}
        disabled={pending}
      />
      {error && (
        <p className="mt-1 font-body text-sm uppercase tracking-[0.16em] text-destructive">
          {t('error')}
        </p>
      )}
    </div>
  );
}

function AddRaceForm({
  onAdd,
  disabled,
}: {
  onAdd: (name: string, date: string, distance: string) => Promise<boolean>;
  disabled: boolean;
}) {
  const t = useTranslations('Settings');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [distance, setDistance] = useState<string>(RACE_DISTANCES[3]);
  const canAdd = name.trim() !== '' && date !== '' && !disabled;

  async function add() {
    if (await onAdd(name, date, distance)) {
      setName('');
      setDate('');
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
      <div className="mt-2">
        <ActionButton onClick={add} disabled={!canAdd} label={t('racesAdd')} pending={disabled} />
      </div>
    </div>
  );
}

export function ActionButton({
  onClick,
  disabled,
  label,
  pending,
  quiet,
  'data-action': dataAction,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  pending?: boolean;
  quiet?: boolean;
  'data-action'?: string;
}) {
  return (
    <button
      type="button"
      data-action={dataAction}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center gap-2 border h-10 px-4 font-body text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent',
        quiet
          ? 'border-border text-muted-foreground hover:text-foreground'
          : 'border-signal text-signal hover:bg-signal hover:text-signal-foreground',
      ].join(' ')}
    >
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </button>
  );
}
