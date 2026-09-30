'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AddRaceResult, SettingsActionResult } from './settings-actions';
import { ActionButton } from '../../action-button';
import { RaceForm } from '../../race-form';
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
 * remove-and-add — the two operations that exist, rather than a third. The add
 * form is the shared {@link RaceForm}, the same one a calendar day opens
 * (`training-architecture/37`).
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
  onAdd: (name: string, date: string, distance: string, asTarget: boolean) => Promise<AddRaceResult>;
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

      <RaceForm
        currentTarget={current.find((r) => r.isTarget) ?? null}
        onAdd={async ({ name, date, distance, asTarget }) => {
          // The persisted id, captured from the result the save hook only
          // reads `ok` from — so remove and make-target work on the new race
          // at once, with no reload (CodeRabbit, PR #67).
          const created = { id: null as string | null };
          const ok = await run(async () => {
            const result = await onAdd(name, date, distance, asTarget);
            if (result.ok) created.id = result.raceId;
            return result;
          });
          if (ok && created.id !== null) {
            // The server's rule, mirrored so the badge is right without a
            // reload: a first race is the target whatever was asked, and a
            // race asked for as the target replaces the one there was.
            const isTarget = asTarget || current.every((r) => !r.isTarget);
            const id = created.id;
            setCurrent((prev) => [
              ...prev.map((r) => (isTarget ? { ...r, isTarget: false } : r)),
              { id, name, date, distance, isTarget },
            ]);
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
