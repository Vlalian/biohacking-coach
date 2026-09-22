'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RACE_DISTANCES } from '@/lib/race-distances';
import { formatFinish, parseFinishInput } from '@/features/onboarding/past-races';
import type { AddPastRaceResult, SettingsActionResult } from './settings-actions';
import { ActionButton } from './settings-races';
import { useSave } from './use-save';

/**
 * The races the athlete has finished (`training-architecture/35`), editable
 * after onboarding, beside the Races list. Same shape as that section: local
 * truth after each action (the actions do not revalidate the route), remove
 * on every entry, an add form with the entry's four fields. Editing is
 * remove-and-add. The experience level is re-derived server-side on every
 * change; nothing here shows or asks for it.
 */
export interface SettingsPastRace {
  id: string;
  distance: string;
  /** `YYYY-MM-DD`. */
  date: string;
  finishSeconds: number | null;
  note: string | null;
}

export interface PastRaceInput {
  distance: string;
  date: string;
  finishSeconds: number | null;
  note: string | null;
}

export function PastRacesSection({
  pastRaces,
  onAdd,
  onRemove,
}: {
  pastRaces: SettingsPastRace[];
  onAdd: (entry: PastRaceInput) => Promise<AddPastRaceResult>;
  onRemove: (pastRaceId: string) => Promise<SettingsActionResult>;
}) {
  const t = useTranslations('Settings');
  const [current, setCurrent] = useState(pastRaces);
  const { pending, error, run } = useSave();

  async function remove(id: string) {
    if (await run(() => onRemove(id))) {
      setCurrent((prev) => prev.filter((r) => r.id !== id));
    }
  }

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {t('pastRacesLabel')}
      </p>
      <p className="mt-1 font-body text-xs text-muted-foreground">{t('pastRacesNote')}</p>

      {current.length === 0 ? (
        <p className="mt-2 font-body text-sm text-muted-foreground">{t('pastRacesNone')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border border border-border">
          {[...current]
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
            .map((r) => (
              <li key={r.id} data-past-race={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm text-foreground">
                    {r.distance} · {r.date}
                    {r.finishSeconds !== null && ` · ${formatFinish(r.finishSeconds)}`}
                  </p>
                  {r.note && <p className="font-body text-xs text-muted-foreground">{r.note}</p>}
                </div>
                <ActionButton onClick={() => remove(r.id)} disabled={pending} label={t('pastRacesRemove')} quiet />
              </li>
            ))}
        </ul>
      )}

      <AddPastRaceForm
        onAdd={async (entry) => {
          const created = { id: null as string | null };
          const ok = await run(async () => {
            const result = await onAdd(entry);
            if (result.ok) created.id = result.pastRaceId;
            return result;
          });
          if (ok && created.id !== null) {
            const id = created.id;
            setCurrent((prev) => [...prev, { id, ...entry }]);
          }
          return ok;
        }}
        disabled={pending}
      />
      {error && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-destructive">
          {t('error')}
        </p>
      )}
    </div>
  );
}

function AddPastRaceForm({
  onAdd,
  disabled,
}: {
  onAdd: (entry: PastRaceInput) => Promise<boolean>;
  disabled: boolean;
}) {
  const t = useTranslations('Settings');
  const [distance, setDistance] = useState<string>(RACE_DISTANCES[2]);
  const [date, setDate] = useState('');
  const [finish, setFinish] = useState('');
  const [note, setNote] = useState('');
  const finishSeconds = parseFinishInput(finish);
  const canAdd = date !== '' && finishSeconds !== undefined && !disabled;

  async function add() {
    if (finishSeconds === undefined) return;
    const ok = await onAdd({
      distance,
      date,
      finishSeconds,
      note: note.trim() === '' ? null : note.trim(),
    });
    if (ok) {
      setDate('');
      setFinish('');
      setNote('');
    }
  }

  return (
    <div className="mt-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {t('pastRacesAddLabel')}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[auto_auto_1fr]">
        <select
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          aria-label={t('raceDistanceLabel')}
          className="border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none focus:border-signal"
        >
          {RACE_DISTANCES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label={t('raceDateLabel')}
          className="border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none focus:border-signal"
        />
        <input
          type="text"
          value={finish}
          onChange={(e) => setFinish(e.target.value)}
          placeholder={t('pastRacesFinishPlaceholder')}
          aria-label={t('pastRacesFinishLabel')}
          className="w-full border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-signal"
        />
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('pastRacesNotePlaceholder')}
        aria-label={t('pastRacesNoteLabel')}
        maxLength={200}
        className="mt-2 w-full border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-signal"
      />
      <div className="mt-2">
        <ActionButton
          onClick={add}
          disabled={!canAdd}
          label={t('pastRacesAdd')}
          pending={disabled}
          data-action="add-past-race"
        />
      </div>
    </div>
  );
}
