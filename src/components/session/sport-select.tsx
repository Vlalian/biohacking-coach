'use client';

import { SESSION_SPORTS } from '@/features/session/session-sport';

/**
 * The closed sport list as a picker (`showable-version/52`): one empty "no
 * sport" option, selected by default, then the seven in order. Shared by the
 * athlete's session form, the Head Coach's edit form and the prescribe panel.
 */
export function SportSelect({
  value,
  onChange,
  noneLabel,
  sportName,
  className,
}: {
  /** The picked sport, or '' for none. */
  value: string;
  onChange: (value: string) => void;
  noneLabel: string;
  sportName: (sport: string) => string;
  className?: string;
}) {
  return (
    <select
      data-field="sport"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={['capitalize', className].filter(Boolean).join(' ')}
    >
      <option value="">{noneLabel}</option>
      {SESSION_SPORTS.map((sport) => (
        <option key={sport} value={sport}>
          {sportName(sport)}
        </option>
      ))}
    </select>
  );
}
