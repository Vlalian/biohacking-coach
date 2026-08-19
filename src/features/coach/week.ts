import type { SessionOrigin } from '@/features/session/session';

/**
 * The athlete's current week as a Coach prompt sees it.
 *
 * Coach Chat is the Coach Overlay's baseline mode, and it is where the athlete
 * asks "should I do tomorrow's intervals?" — a question the Coach cannot answer
 * honestly without knowing that tomorrow has intervals, who put them there, and
 * whether they already happened. This module is the seam that turns stored
 * sessions into that view.
 *
 * Two rules govern the shape, and both are load-bearing rather than stylistic:
 *
 *  - **Entity ids never leave here.** `CONTEXT.md` (Week Activity) is explicit:
 *    sessions are referred to by date and Session Type, with a position
 *    qualifier only for same-type Doubles. A model that reads an id in its own
 *    prompt can recite it back, and a recited id is exactly what a Coach Action
 *    must never be built from — those take their ids from the attached Reference
 *    or from client-resolved criteria (CONTEXT.md, Coach Action).
 *  - **Authorship travels with the session.** The AI's plan authority tracks who
 *    authored a session: free on its own, explain-and-hold on the Head Coach's
 *    (ADR 0003, CONTEXT.md Prescribed Session). Without authorship in the
 *    prompt the Coach offers changes it is forbidden to make, and the athlete
 *    meets a server-side refusal instead of a coaching answer.
 *
 * Naming: a **week** here, not a Week Plan. `CONTEXT.md` reserves Week Plan for
 * the Coach's recommended schedule, whose entries are Planned Sessions; this
 * block also carries Athlete Sessions ("extras on top"), Prescribed Sessions and
 * Detected Activities, so calling the whole thing a Week Plan would name it
 * after only one of its authors.
 *
 * Pure: plain data in, plain data out. No DB, no HTTP, no Anthropic client.
 */

/**
 * What this module needs of a stored session, declared here rather than taken
 * from `features/session`.
 *
 * The prompt layer should not have to change when a column the calendar renders
 * is added or reshaped — it reads eight fields and an id, and saying so keeps
 * the dependency pointed at a shape this module owns. `SessionOrigin` is the
 * deliberate exception: it is a closed set enforced by a database check
 * constraint, and a local copy would drift from the stored values silently,
 * which is precisely the failure the authority checks must never have.
 */
export interface StoredSessionForWeek {
  id: string;
  date: string;
  type: string;
  status: string;
  origin: SessionOrigin;
  title: string | null;
  duration: number | null;
  zone: string | null;
  note: string | null;
}

/**
 * One session of the current week, as the prompt sees it — never an id.
 *
 * `position` is the same-type Double qualifier ("2nd Endurance"), set only when
 * a day genuinely holds two sessions of one type, because that is the only case
 * where a date and a type do not identify a session between two humans.
 */
export interface WeekSession {
  /** ISO 'YYYY-MM-DD', matching the `TODAY:` line so the Coach can read "tomorrow". */
  date: string;
  sessionType: string;
  status: string;
  origin: SessionOrigin;
  /**
   * The athlete's own label for an Athlete Session. Carried because a session
   * typed `Other` says nothing on its own — "Other" and "Other, called Yoga"
   * are different things to coach about. Free text, so it is covered by the
   * prompt builder's identifier assertion like every other note.
   */
  title: string | null;
  durationMinutes: number | null;
  zone: string | null;
  note: string | null;
  /** Ordinal among same-type sessions on the same day; absent when unambiguous. */
  position?: number;
  /**
   * True for the session the athlete tapped "Discuss with Coach" on. The prompt
   * renders this one short and defers its detail to the Reference block, so the
   * session the athlete is actually asking about is described exactly once.
   */
  isReference?: boolean;
}

/**
 * The week's stored sessions as the prompt sees them, in calendar order.
 *
 * `referenceSessionId` is matched here rather than in the prompt builder for one
 * reason: this is the last place that holds ids. Matching downstream would mean
 * carrying an id into the renderer purely to compare it, and the renderer's
 * whole guarantee is that it never sees one.
 */
export function weekFrom(
  sessions: StoredSessionForWeek[],
  referenceSessionId?: string | null,
): WeekSession[] {
  const sameTypeDayCounts = new Map<string, number>();
  for (const s of sessions) {
    const key = `${s.date}|${s.type}`;
    sameTypeDayCounts.set(key, (sameTypeDayCounts.get(key) ?? 0) + 1);
  }

  const seen = new Map<string, number>();

  return sessions.map((s) => {
    const key = `${s.date}|${s.type}`;
    const isDouble = (sameTypeDayCounts.get(key) ?? 0) > 1;
    const position = isDouble ? (seen.get(key) ?? 0) + 1 : undefined;
    if (isDouble) seen.set(key, position as number);

    return {
      date: s.date,
      sessionType: s.type,
      status: s.status,
      origin: s.origin,
      title: s.title,
      durationMinutes: s.duration,
      zone: s.zone,
      note: s.note,
      ...(position ? { position } : {}),
      ...(referenceSessionId && s.id === referenceSessionId ? { isReference: true } : {}),
    };
  });
}
