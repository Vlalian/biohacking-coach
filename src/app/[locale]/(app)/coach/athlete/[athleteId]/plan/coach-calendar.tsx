'use client';

import { Calendar } from '@/app/[locale]/calendar';
import type { Session } from '@/features/session/session';
import { moveSessionAsCoachAction } from '../prescribe-actions';

/**
 * The athlete's calendar as the Head Coach sees it: read-only in every respect
 * except placement.
 *
 * The binding of the athlete's id into the move action is why this exists as a
 * client component rather than the page passing an inline closure — a server
 * component cannot hand a new function to a client one. The id it binds is a
 * claim, not an authority: the action re-resolves the acting coach from the
 * session and re-proves the Coaching Link before anything is written, so a
 * tampered id buys nothing (ADR 0006).
 */
export function CoachCalendar({
  athleteId,
  sessions,
  unavailableDates,
  todayKey,
}: {
  athleteId: string;
  sessions: Session[];
  unavailableDates: string[];
  todayKey: string;
}) {
  return (
    <Calendar
      sessions={sessions}
      unavailableDates={unavailableDates}
      todayKey={todayKey}
      readOnly
      onMove={(sessionId, targetDate, expectedVersion) =>
        moveSessionAsCoachAction(athleteId, sessionId, targetDate, expectedVersion)
      }
    />
  );
}
