/**
 * True for a real calendar day written `YYYY-MM-DD`.
 *
 * Deliberately **not** a regular expression. A pattern accepts `2027-02-30`,
 * which is a shape rather than a day — and `training-architecture/02` exists in
 * part because this codebase used to reason about dates by pattern-matching
 * text: the Training Phase was derived by running four regexes over the
 * athlete's free-text race name, with a silent fallback when none matched.
 *
 * Round-tripping through `Date` asks the calendar instead. February 30th parses
 * to March 2nd and so fails to come back as the string that went in.
 *
 * Shared by onboarding and Settings on purpose: they are two doors onto the same
 * field, and a door with a weaker lock is not a door.
 */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
