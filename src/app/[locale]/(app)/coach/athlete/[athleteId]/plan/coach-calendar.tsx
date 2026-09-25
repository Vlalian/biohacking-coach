'use client';

import { Calendar } from '@/app/[locale]/calendar';
import type { Session } from '@/features/session/session';
import type { HealthSpan } from '@/features/health/health-layer';
import { moveSessionAsCoachAction } from '../prescribe-actions';
import { PrescribePanel } from '../prescribe-panel';

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
  health,
}: {
  athleteId: string;
  sessions: Session[];
  unavailableDates: string[];
  todayKey: string;
  /** Null when the athlete does not share their reports — the calendar then draws no layer. */
  health: HealthSpan[] | null;
}) {
  return (
    <Calendar
      sessions={sessions}
      unavailableDates={unavailableDates}
      todayKey={todayKey}
      health={health ?? []}
      readOnly
      coachAthleteId={athleteId}
      onMove={(sessionId, targetDate, expectedVersion) =>
        moveSessionAsCoachAction(athleteId, sessionId, targetDate, expectedVersion)
      }
      // Beneath the grid and sharing its writes, so an add lands at once
      // (showable-version/44).
      addPanel={(writer) => <PrescribePanel athleteId={athleteId} writer={writer} />}
    />
  );
}
