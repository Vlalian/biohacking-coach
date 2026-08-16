/**
 * The Athlete Session rules, as plain data in and plain data out.
 *
 * Framework-free by construction: no database, no Drizzle, no request. The
 * adapter (`athlete-session.ts`) does the I/O and asks these functions what is
 * legal — the one-way dependency AGENTS.md's "pure core, I/O at the edges"
 * requires. Everything here is decidable from its arguments, so it is tested
 * directly rather than through a mocked database.
 */

/** The Athlete Session types (CONTEXT.md): Mobility and Other coexist with
 *  Rest; Strength and Other-as-training follow the training rules. */
export const ATHLETE_SESSION_TYPES = ['Mobility', 'Strength', 'Other'] as const;

export type AthleteSessionType = (typeof ATHLETE_SESSION_TYPES)[number];

/** The cap on a session note, so free text cannot grow without bound. */
export const NOTE_MAX = 500;

export function isValidAthleteSessionType(type: unknown): type is AthleteSessionType {
  return typeof type === 'string' && (ATHLETE_SESSION_TYPES as readonly string[]).includes(type);
}

/** A duration is either absent or a positive whole number of minutes. */
export function isValidDuration(duration: unknown): duration is number | null {
  return duration === null || (Number.isInteger(duration) && (duration as number) > 0);
}

/** Trims a note to the cap, and collapses an empty one to null so the column
 *  holds "no note" rather than "". */
export function normalizeNote(note: unknown): string | null {
  if (typeof note !== 'string') return null;
  return note.trim().slice(0, NOTE_MAX) || null;
}

/**
 * The status a newly created Athlete Session lands in.
 *
 * Retro-logging is the reason this is not simply 'planned': creating on a day at
 * or before today means the athlete is recording something they already did —
 * "the session is created as already completed (done but forgotten)... there is
 * no deadline on recording reality" (CONTEXT.md, Athlete Session).
 */
export function createdStatusFor(date: string, today: string): 'completed' | 'planned' {
  return date <= today ? 'completed' : 'planned';
}

export type AthleteSessionDraft = {
  type: AthleteSessionType;
  durationMin: number | null;
  isTraining: boolean;
  note: string | null;
};

export type AthleteSessionDraftResult =
  | { ok: true; draft: AthleteSessionDraft }
  | { ok: false; reason: 'invalid' };

/**
 * Validates and normalizes the fields an athlete supplies for their own
 * session, in one place, so create and edit cannot disagree about what is legal.
 */
export function validateAthleteSessionDraft(input: {
  type: unknown;
  durationMin: unknown;
  isTraining: boolean;
  note: unknown;
}): AthleteSessionDraftResult {
  if (!isValidAthleteSessionType(input.type)) return { ok: false, reason: 'invalid' };
  if (!isValidDuration(input.durationMin)) return { ok: false, reason: 'invalid' };

  return {
    ok: true,
    draft: {
      type: input.type,
      durationMin: input.durationMin,
      isTraining: input.isTraining,
      note: normalizeNote(input.note),
    },
  };
}
