import { describe, expect, it } from 'vitest';

import { groundingBlock, onboardingBlock } from './prompt-blocks';

describe('groundingBlock', () => {
  it('GROUNDING: asked what it knows, the Coach looks up before answering and never describes the tool as its scope (knowledge-oracle/07)', () => {
    // The PR #82 smoke: "hvad ved du noget om med fagligt grundlag" got the
    // lookup tool's description read back as the Coach's scope, and no call.
    const g = groundingBlock();
    expect(g).toMatch(/^GROUNDING: Before stating a training-science fact, call look_up_training_science\./);
    expect(g).toContain('Asked what you know or have evidence for, look up the topic named before answering');
    expect(g).toContain('never describe the lookup tool as your scope');
    expect(g).toContain('Never write citations');
  });
});

describe('onboardingBlock — hours a week (training-architecture/35)', () => {
  it('renders hours/week from the integer and omits the line when unknown', () => {
    // `block()` returns null for an empty section; the string form is what the prompt sees.
    expect(String(onboardingBlock({ hoursPerWeek: 8 }))).toContain('hours/week=8');
    expect(String(onboardingBlock({ hoursPerWeek: 8 }))).toContain('a ceiling to plan within');
    expect(String(onboardingBlock({ hoursPerWeek: null }))).not.toContain('hours/week');
    expect(String(onboardingBlock({}))).not.toContain('hours/week');
  });
});
