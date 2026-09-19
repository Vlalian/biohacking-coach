import { describe, expect, it } from 'vitest';

import { groundingBlock } from './prompt-blocks';

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
