import type { Session } from '@/features/session/session';
import type { SessionInput } from '@/features/information-view/build-dataset';

/**
 * Link Visibility — the doctor-patient sharing rules of a Coaching Link, as a
 * pure module (ADR 0003, and the signed-off mapping in route ticket 05 amended
 * 2026-07-17).
 *
 * Two booleans collapse CONTEXT.md's six sections, and the mapping is the
 * contract — field-level, not gestural:
 *
 *   - **Always on, no flag, by construction:** the calendar, sessions and
 *     their parameters (date, type, duration, zone, title, note), statuses,
 *     and the move log. "A Head Coach who can't see the plan isn't a coach;
 *     sever the link instead." There is no flag to turn this off.
 *   - **`shareAthleteReports`** governs what the athlete *reported about their
 *     own body*: Session Reflections (Body/Mind RPE + comment), Check-in data,
 *     and Athlete Profile training fields/stats.
 *   - **`shareAiTranscripts`** governs Coach Chat and Weekly Session transcripts.
 *
 * These functions are the single place the mapping is applied, and they run on
 * the server before any data crosses to the browser — Link Visibility is
 * enforced at the network layer, not hidden in the UI (ticket 11). If a flag
 * is false, the withheld data is never fetched-then-hidden; it is stripped
 * here so it never reaches the client at all.
 */

/** The flags a Coaching Link carries, as the visibility rules read them. */
export type LinkVisibility = {
  shareAthleteReports: boolean;
  shareAiTranscripts: boolean;
};

/**
 * True when the coach may see the athlete's self-reported data — Session
 * Reflections, Check-ins, and Profile training fields. The named predicate so
 * every caller asks the same question the same way.
 */
export function canSeeAthleteReports(v: LinkVisibility): boolean {
  return v.shareAthleteReports;
}

/** True when the coach may see Coach Chat and Weekly Session transcripts. */
export function canSeeTranscripts(v: LinkVisibility): boolean {
  return v.shareAiTranscripts;
}

/** The Session Reflection fields, nulled — the one shape both strippers share. */
function withoutReflection<
  T extends {
    feedbackBody: number | null;
    feedbackMind: number | null;
    feedbackComment: string | null;
  },
>(row: T): T {
  return { ...row, feedbackBody: null, feedbackMind: null, feedbackComment: null };
}

/**
 * Strips the Session Reflection from calendar sessions when reports are not
 * shared. The plan itself — date, type, duration, zone, title, note, status —
 * always survives; only the Body/Mind/comment the athlete reported is withheld.
 * Returns the same objects when reports are shared, a reflection-nulled copy
 * when they are not.
 */
export function applyVisibilityToSessions(
  sessions: Session[],
  v: LinkVisibility,
): Session[] {
  if (canSeeAthleteReports(v)) return sessions;
  return sessions.map(withoutReflection);
}

/**
 * The same withholding for the Information View's builder inputs: with reports
 * off, the Session Reflection fields are nulled before the dataset is built, so
 * the Body & Mind panel has no reading and renders no panel at all — "gone, not
 * empty" (ADR 0004). The plan-derived panels (volume, consistency, zones) are
 * untouched, because the calendar they read is always visible.
 */
export function applyVisibilityToInputs(
  rows: SessionInput[],
  v: LinkVisibility,
): SessionInput[] {
  if (canSeeAthleteReports(v)) return rows;
  return rows.map(withoutReflection);
}
