/**
 * The sports a session can carry (`showable-version/52`): the card's icon says
 * which one, and the Session Type is colour only. A closed list, so a model's
 * "cycling" cannot arrive and miss the icon lookup in silence.
 */
export const SESSION_SPORTS = ['swim', 'bike', 'run', 'brick', 'strength', 'mobility', 'misc'] as const;

export type SessionSport = (typeof SESSION_SPORTS)[number];

export function isSessionSport(value: unknown): value is SessionSport {
  return typeof value === 'string' && (SESSION_SPORTS as readonly string[]).includes(value);
}
