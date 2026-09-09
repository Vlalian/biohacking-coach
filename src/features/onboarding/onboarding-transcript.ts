import type { StepAnswer } from './onboarding-flow';

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
    case 'experience':
      return payload.experienceLevel;
    case 'distance':
      return payload.raceDistance;
    case 'race':
      // "No race yet" is an answer, so it gets a transcript line of its own
      // rather than an empty one — the Coach's log should show the athlete
      // said it, not that the question went by.
      return 'noRaceYet' in payload ? 'No race booked yet' : payload.raceTarget;
    case 'adaptive': {
      const parts = [
        payload.availableHours,
        payload.sportBackground?.join(', '),
        payload.motivation,
        payload.bestTime,
        payload.weakestDiscipline?.join(', '),
        payload.hasHumanCoach,
        payload.targetTime,
        payload.trackedMetrics?.join(', '),
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(' · ') : '—';
    }
    case 'constraints': {
      const days =
        payload.fixedConstraints && payload.fixedConstraints.length > 0
          ? payload.fixedConstraints.join(', ')
          : '—';
      return `${days} · ${payload.weeklySessionDay ?? 'Flexible'}`;
    }
  }
}
