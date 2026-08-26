import type { Session } from './session';

/**
 * What the loser of a concurrent write is told.
 *
 * The rule this serves is "no silent overwrites": when the athlete and their
 * Head Coach write the same session at once, the second write is refused rather
 * than applied, and the writer is shown enough to decide what to do — not just
 * that it failed.
 *
 * Three versions are named deliberately (the shape the system design asked for):
 * the **base** they started from, the **current** row that landed first, and the
 * **attempted** change they were making. Without all three a person cannot tell
 * whether their edit is now redundant, still wanted, or actively wrong.
 *
 * This module is pure — no database, no framework. It decides *what to say*
 * about a conflict; `versioned-write.ts` is what detects one.
 */

/** The fields a conflicting write can disagree about. */
export type ConflictField =
  | 'date'
  | 'type'
  | 'duration'
  | 'zone'
  | 'title'
  | 'note'
  | 'deleted';

/** One field where the attempted write and the winning write disagree. */
export type FieldDivergence = {
  field: ConflictField;
  /** What the row holds now, after the write that won. Null when it was deleted. */
  current: string | null;
  /** What this writer was trying to set it to. */
  attempted: string | null;
};

export type SessionConflict = {
  sessionId: string;
  /** The version this writer read before making their change. */
  baseVersion: number;
  /** The row as it stands now, or null when the winning write deleted it. */
  current: Session | null;
  /** Only the fields that actually differ — an unchanged field is noise. */
  divergences: FieldDivergence[];
};

/** The subset of a session a write can set, as strings for display. */
export type AttemptedChange = Partial<Record<ConflictField, string | null>>;

const COMPARED: readonly ConflictField[] = ['date', 'type', 'duration', 'zone', 'title', 'note'];

/** Renders a stored value as the string the divergence list compares and shows. */
function display(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Builds the conflict report from the row that won and the change that lost.
 *
 * A deleted row is its own divergence rather than a list of field differences:
 * "the session you were editing is gone" is the only useful thing to say, and
 * comparing fields against nothing would produce a wall of noise.
 */
export function describeConflict(params: {
  sessionId: string;
  baseVersion: number;
  current: Session | null;
  attempted: AttemptedChange;
}): SessionConflict {
  const { sessionId, baseVersion, current, attempted } = params;

  if (!current) {
    return {
      sessionId,
      baseVersion,
      current: null,
      divergences: [{ field: 'deleted', current: null, attempted: null }],
    };
  }

  const divergences = COMPARED.flatMap<FieldDivergence>((field) => {
    // A field the writer never set cannot diverge — they were not competing for
    // it, so reporting it would blame them for someone else's change.
    if (!(field in attempted)) return [];

    const currentValue = display(current[field as keyof Session] as string | number | null);
    const attemptedValue = display(attempted[field]);
    if (currentValue === attemptedValue) return [];

    return [{ field, current: currentValue, attempted: attemptedValue }];
  });

  return { sessionId, baseVersion, current, divergences };
}

/**
 * Whether the losing write would have been a no-op anyway.
 *
 * When the winner already set every field to what this writer wanted, refusing
 * is technically correct and practically annoying — the caller can use this to
 * say "already done" instead of raising an alarm.
 */
export function isRedundant(conflict: SessionConflict): boolean {
  return conflict.current !== null && conflict.divergences.length === 0;
}
