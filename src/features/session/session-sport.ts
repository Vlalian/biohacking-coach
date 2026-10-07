/**
 * The sports a session can carry (`showable-version/52`): the card's icon says
 * which one, and the Session Type is colour only. A closed list, so a model's
 * "cycling" cannot arrive and miss the icon lookup in silence.
 */
export const SESSION_SPORTS = ['swim', 'bike', 'run', 'brick', 'strength', 'mobility', 'misc'] as const;

export type SessionSport = (typeof SESSION_SPORTS)[number];

export function isSessionSport(value: unknown): value is SessionSport {
  return (SESSION_SPORTS as readonly unknown[]).includes(value);
}

/** A sport is optional: absent or null is fine, anything else must be one of the seven. */
export function isOptionalSessionSport(value: unknown): value is SessionSport | null | undefined {
  return value === undefined || value === null || isSessionSport(value);
}
