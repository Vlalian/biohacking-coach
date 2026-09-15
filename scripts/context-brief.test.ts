import { describe, it, expect } from 'vitest';
import { firstSentence, glossaryIndex, isTermName, orientation, renderBrief } from './context-brief.mjs';

/**
 * The per-session brief is generated from the glossary and never hand-edited,
 * so what it indexes is decided here. The review of 2026-09-15 found it listing
 * bold sentences ("Capture is five steps, not ten.") as terms.
 */
describe('context-brief — what counts as a term', () => {
  it('keeps a noun phrase and drops a bold sentence or label', () => {
    expect(isTermName('Head Coach')).toBe(true);
    expect(isTermName('A draft in flight when a Coaching Link changes (decided 2026-09-14):')).toBe(false);
    expect(isTermName('Deliberately not a property of the race.')).toBe(false);
    expect(isTermName('An Open Horizon is loud.')).toBe(false);
    expect(isTermName('one two three four five six seven eight nine')).toBe(false);
  });

  it('indexes sections and terms in order, first sentence only, CRLF or LF', () => {
    const md = '## Coaching Hierarchy\r\n\r\n**Roster** — the set of athletes linked to a Head Coach. More words.\r\n**Bold heading**\r\n- **Nested** — one. Two.\r\n**Not a term.** — prose here.\r\n';
    expect(glossaryIndex(md)).toEqual([
      { section: 'Coaching Hierarchy' },
      { term: 'Roster', definition: 'the set of athletes linked to a Head Coach.' },
      { term: 'Nested', definition: 'one.' },
    ]);
  });

  it('caps a run-on first sentence and leaves a short one alone', () => {
    expect(firstSentence('Short one. Second.')).toBe('Short one.');
    expect(firstSentence('x'.repeat(300))).toHaveLength(220);
    expect(firstSentence('x'.repeat(300)).endsWith('…')).toBe(true);
  });

  it('lifts exactly the orientation section out of the overview', () => {
    const md = '# App\n\nintro\n\n## Orientation — where truth lives\n\n| a | b |\n\n## Current state\n\nlots\n';
    expect(orientation(md)).toBe('## Orientation — where truth lives\n\n| a | b |');
    expect(orientation('no such section')).toBe('');
  });

  it('renders the brief with the generated-file warning, the orientation and the index', () => {
    const out = renderBrief('## S\n**T** — d.\n', '## Orientation — where truth lives\n| x |\n');
    expect(out).toContain('Do not edit');
    expect(out).toContain('## Orientation — where truth lives');
    expect(out).toContain('### S');
    expect(out).toContain('- **T** — d.');
    expect(out.endsWith('\n')).toBe(true);
  });
});
