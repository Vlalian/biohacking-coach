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
  | 'isTraining'
  | 'deleted';

/** One field where the attempted write and the winning write disagree. */
export type FieldDivergence = {
  field: ConflictField;
  /** What the row holds now, after the write that won. Null when it was deleted. */
  current: string | null;
  /** What this writer was trying to set it to. */
  attempted: string | null;
};

/** What the refused writer was trying to do. See {@link isRedundant}. */
export type WriteIntent = 'edit' | 'delete';

export type SessionConflict = {
  sessionId: string;
  /**
   * Edit or delete. Recorded because the two have opposite notions of "already
   * done", and without it a refused delete cannot be told from a satisfied one.
   */
  intent: WriteIntent;
  /** The version this writer read before making their change. */
  baseVersion: number;
  /** The row as it stands now, or null when the winning write deleted it. */
  current: Session | null;
  /** Only the fields that actually differ — an unchanged field is noise. */
  divergences: FieldDivergence[];
};

/** The subset of a session a write can set, as strings for display. */
export type AttemptedChange = Partial<Record<ConflictField, string | null>>;

const COMPARED: readonly ConflictField[] = [
  'date',
  'type',
  'duration',
  'zone',
  'title',
  'note',
  // An Athlete Session edit can change nothing but this, and a conflict that
  // reports no divergence reads as "already done" — so leaving it out made a
  // real disagreement invisible.
  'isTraining',
];

/** Renders a stored value as the string the divergence list compares and shows. */
function display(value: string | number | boolean | null | undefined): string | null {
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
  intent: WriteIntent;
}): SessionConflict {
  const { sessionId, baseVersion, current, attempted, intent } = params;

  if (!current) {
    return {
      sessionId,
      baseVersion,
      intent,
      current: null,
      divergences: [{ field: 'deleted', current: null, attempted: null }],
    };
  }

  const divergences = COMPARED.flatMap<FieldDivergence>((field) => {
    // A field the writer never set cannot diverge — they were not competing for
    // it, so reporting it would blame them for someone else's change.
    if (!(field in attempted)) return [];

    const currentValue = display(
      current[field as keyof Session] as string | number | boolean | null,
    );
    const attemptedValue = display(attempted[field]);
    if (currentValue === attemptedValue) return [];

    return [{ field, current: currentValue, attempted: attemptedValue }];
  });

  return { sessionId, baseVersion, intent, current, divergences };
}

/**
 * Whether the losing write would have been a no-op anyway.
 *
 * When the winner already set every field to what this writer wanted, refusing
 * is technically correct and practically annoying — the caller can use this to
 * say "already done" instead of raising an alarm.
 */
export function isRedundant(conflict: SessionConflict): boolean {
  // A delete asks for one outcome: the row gone. It is redundant when someone
  // else already removed it, and emphatically NOT redundant while the row is
  // still there — which is exactly what the field comparison below would have
  // concluded, because a delete names no fields, so `divergences` is always
  // empty and every refused delete looked satisfied.
  if (conflict.intent === 'delete') return conflict.current === null;

  // An edit is redundant when the winner already set everything it wanted. A
  // deleted row is never that: there is nothing left to have wanted.
  return conflict.current !== null && conflict.divergences.length === 0;
}
