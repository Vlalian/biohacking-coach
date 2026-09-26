import type { FirstDayChoice, StepAnswer } from './onboarding-flow';

/**
 * A list joined for the transcript, or nothing when it is not a list.
 *
 * This runs on the raw payload before the flow validates it, so a field typed
 * as an array can arrive as anything. A string here used to throw from `.join`
 * one call before validation would have refused the payload cleanly
 * (CodeRabbit, PR #60). Rendering nothing is right: the line never lands,
 * because the step is refused a moment later.
 */
function listed(value: unknown): string | undefined {
  return Array.isArray(value) && value.length > 0 ? value.join(', ') : undefined;
}

/**
 * One line per race, distance and date: what the athlete said they finished,
 * in the order given. Notes and finish times stay off the transcript; they
 * are on the row. Runs on the raw payload, so every field is read defensively.
 */
function pastRacesLine(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return 'No races finished yet';
  return value
    .map((r) => {
      // Raw client input: `answerOnboardingAction` renders this line before the
      // payload is validated, so a forged `[null]` must read as "?" rather than
      // throw past the action's own refusal (CodeRabbit, PR #98).
      const rec = (r ?? {}) as { distance?: unknown; date?: unknown };
      return `${String(rec.distance ?? '?')} ${String(rec.date ?? '?')}`;
    })
    .join(' · ');
}

/** The given answers joined, or a dash when the athlete gave none of them. */
function joinedOrDash(parts: readonly (string | undefined)[]): string {
  const given = parts.filter(Boolean);
  return given.length > 0 ? given.join(' · ') : '—';
}

/** The three answers as the Coach's log reads them (`training-architecture/36`). */
const FIRST_DAY_TRANSCRIPT: Record<FirstDayChoice, string> = {
  today: 'Starting today',
  tomorrow: 'Starting tomorrow',
  nextMonday: 'Starting next Monday',
};

/**
 * The athlete's answer as one human-readable transcript line.
 *
 * Exported for its own test. It is a pure switch over every step, and reaching
 * it only through the server action left two thirds of its branches uncovered —
 * so a step whose line rendered wrongly would have shown up in an athlete's
 * transcript rather than in a test.
 */
export function answerText(payload: StepAnswer): string {
  switch (payload.step) {
    case 'language':
      return payload.language === 'da' ? 'Dansk' : 'English';
    case 'name':
      // Never the name. The transcript lands in `messages`, a training-side
      // table keyed by athlete id, and a name may not (ADR 0006). The line
      // records that the question was answered — chosen, or left blank.
      return typeof payload.preferredName === 'string' && payload.preferredName.trim() !== ''
        ? 'Chosen'
        : '—';
    case 'pastRaces':
      return pastRacesLine(payload.pastRaces);
    case 'distance':
      return payload.raceDistance;
    case 'hours':
      return `${payload.hoursPerWeek} h/week`;
    case 'firstDay':
      // The choice, not the date it resolved to: the log records what the
      // athlete said, and "next Monday" is what they said.
      return FIRST_DAY_TRANSCRIPT[payload.firstDay];
    case 'race':
      // "No race yet" is an answer, so it gets a transcript line of its own
      // rather than an empty one — the Coach's log should show the athlete
      // said it, not that the question went by.
      // `=== true`, not `in`: the flow treats only a true `noRaceYet` as the
      // no-race answer and stores anything else as a named race. The transcript
      // has to say the same thing the record does.
      return 'noRaceYet' in payload && payload.noRaceYet === true
        ? 'No race booked yet'
        : (payload as { raceTarget: string }).raceTarget;
    case 'adaptive': {
      const parts = [
        listed(payload.sportBackground),
        payload.motivation,
        payload.bestTime,
        listed(payload.weakestDiscipline),
        payload.hasHumanCoach,
        payload.targetTime,
        listed(payload.trackedMetrics),
      ];
      return joinedOrDash(parts);
    }
    case 'history':
      return joinedOrDash([payload.yearsTraining, payload.recentWeeklyVolume]);
    case 'constraints': {
      const days = listed(payload.fixedConstraints) ?? '—';
      return `${days} · ${payload.weeklySessionDay ?? 'Sunday'}`;
    }
  }
}
