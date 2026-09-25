import type { Session } from '@/features/session/session';
import { HEAD_COACH_ORIGIN } from './head-coach-authority';

/** The mutable fields of a session the Head Coach may set. */
export type PrescriptionInput = {
  date: string;
  type: string;
  duration?: number | null;
  zone?: string | null;
  title?: string | null;
  note?: string | null;
  isTraining?: boolean;
};

/**
 * The columns a Head Coach's add or edit writes: the optional fields
 * normalised, the type trimmed, and training by default.
 *
 * Pure and client-safe on purpose (showable-version/44). The server writes
 * these columns, and the calendar shows the same edit before the server
 * answers, so both read this one rule rather than two copies of it.
 */
export function prescriptionColumns(input: PrescriptionInput) {
  return {
    date: input.date,
    type: input.type.trim(),
    duration: input.duration ?? null,
    zone: input.zone ?? null,
    title: input.title ?? null,
    note: input.note ?? null,
    isTraining: input.isTraining ?? true,
  };
}

/**
 * The session a prescription writes: its columns, planned, first in its day,
 * the Head Coach's. The server returns this as what it wrote, and the calendar
 * shows it the moment the coach adds it (showable-version/44), so the chip
 * does not change when the answer comes back.
 */
export function prescribedSessionOf(id: string, input: PrescriptionInput, version: number): Session {
  return {
    id,
    ...prescriptionColumns(input),
    status: 'planned',
    parked: false,
    dayOrder: 0,
    origin: HEAD_COACH_ORIGIN,
    feedbackBody: null,
    feedbackMind: null,
    feedbackComment: null,
    version,
  };
}
