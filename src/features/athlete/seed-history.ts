import type { NewSessionRow } from '@/db/schema';
import { dateKey } from '@/lib/date';
import { uuidV5 } from './uuid-v5';

/**
 * A week of *completed* training history for the real dev athlete, laid across
 * last Mon–Sun — the rows `scripts/seed.ts` writes for Mads.
 *
 * Deliberately the past, not a future plan: a new athlete should reach the
 * calendar with no pre-planned week — the Week Plan is produced by running a
 * Weekly Session and confirming it, not by the seed. What the seed provides is
 * history the Coach can review and the Information View can chart (two days
 * carry a Session Reflection so the review has real feedback to read).
 *
 * Pure: athlete id and clock in, rows out. Moved out of the seed script when
 * the synthetic personas were retired (code-health/13), because one row here
 * now carries an acceptance criterion — the Athlete Session below — and a
 * criterion that lives only in a script nothing can run without credentials
 * is a criterion nothing checks.
 */

/**
 * The one Athlete Session the seed produces: Sunday's Strength, `origin:
 * 'athlete'`. Strength is an Athlete Session type, not one the Coach may plan
 * (`athlete-session-rules.ts`), so the row is honest about its author — and it
 * is what keeps H11 observable now that no persona carries one: the Head Coach
 * opens it on the plan and finds "athlete's own", no edit, no delete.
 *
 * A stable id, unlike the Coach-origin rows: the reseed clears Coach-origin
 * sessions and leaves the athlete's own alone (so nothing a real person logs
 * is lost), which would pile this row up on every run without one. With it, a
 * reseed replaces the row rather than adding a sibling.
 *
 * Derived from the athlete, not one constant for all: a preview database
 * seeds a second athlete beside the first (`/preview`), and one global id
 * collided on the primary key the first time that happened (2026-09-18).
 * UUID v5 over a fixed namespace, so it is a valid uuid column value and the
 * same on every run for the same athlete.
 */
const SEED_SESSION_NAMESPACE = 'f2a6c5e1-7b3d-4c8e-9a1f-5d4e3c2b1a09';

export function seedAthleteSessionId(athleteId: string): string {
  return uuidV5(SEED_SESSION_NAMESPACE, athleteId);
}

/** Last week's Monday: this week's Monday minus seven days. */
function lastWeekMonday(now: Date): Date {
  const mondayOffset = (now.getDay() + 6) % 7; // 0 = Monday
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset - 7);
}

/** A day of the week, as the row it becomes minus what the clock and the athlete supply. */
type Day = Omit<NewSessionRow, 'athleteId' | 'date' | 'ratedAt'> & { day: number };

const training = { status: 'completed', dayOrder: 0, isTraining: true } as const;

// One training session per day (the Rest day carries no row — the calendar
// shows rest as the absence of a session). Reflections are Body + Mind on the
// 1–5 scale the column holds.
const WEEK: readonly Day[] = [
  { ...training, day: 0, origin: 'coach', type: 'Endurance', duration: 60, zone: 'Zone 2', title: 'Easy aerobic ride', note: 'Keep it conversational.', feedbackBody: 4, feedbackMind: 4, feedbackComment: 'Felt smooth.' },
  { ...training, day: 1, origin: 'coach', type: 'Intensity', duration: 45, zone: 'Zone 4', title: 'Threshold intervals', note: '4 x 6 min at threshold.', feedbackBody: 2, feedbackMind: 3, feedbackComment: 'Legs heavy on the last rep.' },
  { ...training, day: 2, origin: 'coach', type: 'Recovery', duration: 40, zone: 'Zone 1', title: 'Easy swim', note: 'Technique focus, easy effort.', feedbackBody: null, feedbackMind: null, feedbackComment: null },
  { ...training, day: 3, origin: 'coach', type: 'Tempo', duration: 60, zone: 'Zone 3', title: 'Tempo run', note: '20 min steady in the middle.', feedbackBody: null, feedbackMind: null, feedbackComment: null },
  { ...training, day: 5, origin: 'coach', type: 'Endurance', duration: 180, zone: 'Zone 2', title: 'Long ride', note: 'Fuel every 45 min.', feedbackBody: null, feedbackMind: null, feedbackComment: null },
  { ...training, day: 6, origin: 'athlete', type: 'Strength', duration: 45, zone: null, title: 'Strength & mobility', note: 'Core and single-leg work.', feedbackBody: null, feedbackMind: null, feedbackComment: null },
];

export function seedWeekRows(athleteId: string, now: Date): NewSessionRow[] {
  const monday = lastWeekMonday(now);
  const dayDate = (offset: number) =>
    dateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset));

  return WEEK.map(({ day, ...s }) => ({
    ...s,
    ...(s.origin === 'athlete' ? { id: seedAthleteSessionId(athleteId) } : {}),
    athleteId,
    date: dayDate(day),
    // ratedAt is what marks a Session Reflection as given; derived so a row
    // with scores can never read as unrated.
    ratedAt: s.feedbackBody === null ? null : now,
  }));
}
