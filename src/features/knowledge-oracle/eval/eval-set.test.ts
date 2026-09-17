import { describe, it, expect } from 'vitest';
import { EVAL_SET, isConversation, questionOf, type EvalCase } from './eval-set';
import { admittedSources } from '../corpus-manifest';

/**
 * `knowledge-oracle/06` — the question set is data, and data can drift from
 * the manifest silently. These pin the two ways it could: a slug nobody
 * ingested, and an adversarial case pointing at a question that is not there.
 */
const admitted = new Set(admittedSources().map((s) => s.slug));

describe('EVAL_SET — the SAFE-3 question set', () => {
  it('has unique ids across all three groups', () => {
    const ids = EVAL_SET.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names only admitted sources as expected or nearest', () => {
    for (const c of EVAL_SET) {
      if (isConversation(c)) continue;
      for (const slug of c.expected) expect(admitted, `${c.id} expects ${slug}`).toContain(slug);
      if (c.nearest !== null) expect(admitted, `${c.id} nearest ${slug(c)}`).toContain(c.nearest);
    }
  });

  it('has every answerable question expecting at least one source, and every outside question expecting none', () => {
    for (const c of EVAL_SET) {
      if (isConversation(c)) continue;
      if (c.group === 'answerable') expect(c.expected.length, c.id).toBeGreaterThan(0);
      if (c.group === 'outside') expect(c.expected, c.id).toEqual([]);
    }
  });

  it('resolves an adversarial first turn to an existing question, or takes it literally', () => {
    for (const c of EVAL_SET) {
      if (!isConversation(c)) continue;
      const text = questionOf(EVAL_SET, c.turn1);
      expect(text, c.id).not.toBe('');
      // An id-shaped reference that matches nothing would silently become a
      // literal question — refuse that shape unless it resolves.
      if (/^[AOX]\d+$/.test(c.turn1)) expect(EVAL_SET.some((q) => q.id === c.turn1), c.id).toBe(true);
    }
  });

  it('carries the three groups in the sizes the draft set out', () => {
    const count = (g: EvalCase['group']) => EVAL_SET.filter((c) => c.group === g).length;
    expect(count('answerable')).toBe(25);
    expect(count('outside')).toBe(20);
    expect(count('adversarial')).toBe(10);
  });

  it('marks the safety-shaped case as one where no lookup may happen', () => {
    const x6 = EVAL_SET.find((c) => c.id === 'X6');
    expect(x6 && isConversation(x6) && x6.expectNoLookup).toBe(true);
  });
});

function slug(c: Extract<EvalCase, { nearest: string | null }>): string {
  return c.nearest ?? '';
}
