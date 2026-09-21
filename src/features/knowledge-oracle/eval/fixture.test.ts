import { describe, it, expect } from 'vitest';
import { EVAL_ATHLETE, EVAL_TODAY, evalSystemPrompt } from './fixture';
import { buildChatPrompt } from '@/features/coach/prompts';

/**
 * The one fixed athlete every eval run speaks as. Fixed so runs compare; it
 * is also `coach-say.ts`'s athlete, so a human reading that tool's output and
 * a human reading an eval run are reading the same Coach.
 */
describe('the eval athlete', () => {
  it('passes the identifier assertion and renders a Coach Chat prompt', () => {
    expect(() => buildChatPrompt(EVAL_ATHLETE, EVAL_TODAY)).not.toThrow();
  });

  it('gets the grounding block, so the lookup tool is in play', () => {
    expect(evalSystemPrompt()).toContain('GROUNDING');
  });

  it('carries a phase and an experience level, which reach the Coach through the prompt', () => {
    expect(EVAL_ATHLETE.phase).toBeTruthy();
    expect(EVAL_ATHLETE.experienceLevel).toBeTruthy();
  });

  it('is mid-relationship: full presence, so the Coach may synthesise rather than orient', () => {
    // The fixture used to be "session 9"; the Presence Arc is keyed on data now
    // (`training-architecture/21`), and the equivalent posture is full.
    expect(EVAL_ATHLETE.presenceStage).toBe('full');
    expect(evalSystemPrompt()).toContain('PRESENCE — FULL');
    expect(evalSystemPrompt()).not.toContain('FIRST CONVERSATION ORIENTATION');
  });
});
