import type { CheckIn } from '@/features/coach/check-in';
import { buildChatPrompt } from '@/features/coach/prompts';

/**
 * The one athlete every eval run speaks as (`knowledge-oracle/06`).
 *
 * Fixed so runs compare: a different athlete would change the system prompt,
 * and then a changed reply could be the prompt rather than the Coach. This is
 * also `coach-say.ts`'s athlete, so the human reading that tool's output and
 * the human reading an eval run are reading the same Coach in the same
 * situation. No readiness scores on purpose (see the note in `coach-say.ts`):
 * the eval must exercise the branch real athletes are on.
 *
 * Nothing here is a person. `buildChatPrompt` asserts it, and `fixture.test.ts`
 * pins that the assertion passes.
 */
export const EVAL_ATHLETE: CheckIn = {
  phase: 'Build',
  presenceStage: 'full',
  commStyle: 'direct, technical, no reassurance',
  experienceLevel: 'intermediate',
  language: 'English',
  weeklySessionDay: 'Monday',
  fixedConstraints: ['Thursday'],
  raceTarget: 'Ironman Copenhagen, 17 August 2027',
  equipment: [
    { id: 'e1', category: 'bike', name: 'Canyon Speedmax', details: 'CF SLX, Quarq power meter', addedDate: '2026-01-04' },
    { id: 'e2', category: 'watch', name: 'Garmin Fenix 8', details: null, addedDate: '2026-02-11' },
  ],
  onboarding: {
    sportBackground: 'running',
    availableHours: '13–16h',
    motivation: 'finish under 11 hours',
    weakestDiscipline: 'swim',
    hasHumanCoach: 'no',
  },
};

/** A fixed "today", so the prompt's dates never move between runs. */
export const EVAL_TODAY = '2026-08-17';

/** The Coach Chat system prompt the eval athlete gets — no Reference, no week. */
export function evalSystemPrompt(): string {
  return buildChatPrompt(EVAL_ATHLETE, EVAL_TODAY);
}
