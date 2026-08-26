import { describe, it, expect } from 'vitest';
import { chunkText, splitSentences } from './chunk';

/**
 * Prose that reads like the corpus: full sentences, some carrying the
 * abbreviations and decimals that a naive sentence splitter breaks on.
 */
const SENTENCES = [
  'Tapering reduces training volume while intensity is broadly maintained.',
  'A two-week taper produced the largest performance gain in the pooled analysis.',
  'Carbohydrate intake of 60 to 90 g per hour is recommended for efforts beyond two and a half hours.',
  'Athletes who trained the gut tolerated higher feeding rates than those who did not.',
  'Polarized distribution places roughly 80 percent of sessions at low intensity.',
  'Concurrent strength work placed after an endurance session reduced the interference effect.',
  'Non-functional overreaching is distinguished from overtraining syndrome by the time course of recovery.',
  'Brick sessions expose the athlete to the running economy cost of prior cycling.',
];

function proseOfAtLeast(chars: number): string {
  const out: string[] = [];
  let i = 0;
  while (out.join(' ').length < chars) {
    out.push(SENTENCES[i % SENTENCES.length]);
    i++;
  }
  return out.join(' ');
}

describe('splitSentences', () => {
  it('does not split on decimals or abbreviations', () => {
    const text =
      'Intake of 3.5 g per kilogram was reported. Rates of 90 g per hour, e.g. from multiple transportable carbohydrates, were tolerated. Podlogar et al. (2022) reviewed the evidence.';

    const sentences = splitSentences(text);

    expect(sentences).toHaveLength(3);
    // The decimal must stay inside its sentence, and the abbreviation must not
    // end one — both are the failure modes that make a chunk begin mid-thought.
    expect(sentences[0]).toContain('3.5 g');
    expect(sentences[1]).toContain('e.g. from');
    expect(sentences[2]).toContain('et al. (2022)');
  });
});

describe('chunkText', () => {
  it('returns one chunk, unmodified, for a passage shorter than the cap', () => {
    const text = SENTENCES[0];
    const chunks = chunkText(text, { maxChars: 1000 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].ordinal).toBe(0);
  });

  it('returns nothing for empty or whitespace-only text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('splits a long passage into several chunks, none over the cap', () => {
    const maxChars = 400;
    const chunks = chunkText(proseOfAtLeast(3000), { maxChars, overlapChars: 100 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length, chunk.text.slice(0, 40)).toBeLessThanOrEqual(maxChars);
    }
  });

  it('does not begin or end a chunk mid-sentence', () => {
    const chunks = chunkText(proseOfAtLeast(3000), { maxChars: 400, overlapChars: 100 });

    for (const chunk of chunks) {
      // Every sentence in the fixture ends in a period and starts with a capital.
      // If packing cut one in half, one of these two assertions fails.
      expect(chunk.text, chunk.text.slice(0, 40)).toMatch(/^[A-Z]/);
      expect(chunk.text, chunk.text.slice(-40)).toMatch(/\.$/);
    }
  });

  it('overlaps consecutive chunks, so a fact spanning a boundary survives whole', () => {
    const chunks = chunkText(proseOfAtLeast(3000), { maxChars: 400, overlapChars: 150 });

    expect(chunks.length).toBeGreaterThan(1);

    for (let i = 1; i < chunks.length; i++) {
      const previous = splitSentences(chunks[i - 1].text);
      const current = splitSentences(chunks[i].text);
      // The last sentence of the previous chunk opens the next one. That is what
      // makes a fact straddling the boundary readable in at least one chunk.
      expect(current[0], `chunk ${i}`).toBe(previous[previous.length - 1]);
    }
  });

  it('numbers chunks from zero, in order', () => {
    const chunks = chunkText(proseOfAtLeast(3000), { maxChars: 400, overlapChars: 100 });

    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });

  it('estimates tokens for each chunk', () => {
    const chunks = chunkText(proseOfAtLeast(2000), { maxChars: 400 });

    for (const chunk of chunks) {
      expect(chunk.tokenEstimate).toBe(Math.ceil(chunk.text.length / 4));
    }
  });

  it('hard-splits a single run of text longer than the cap rather than exceeding it', () => {
    // A reference blob with no sentence boundary in it — the one input that
    // forces a mid-sentence cut. The cap must still hold.
    const runOn = 'word '.repeat(300).trim();
    const chunks = chunkText(runOn, { maxChars: 200, overlapChars: 50 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(200);
    }
  });

  it('terminates on text with no whitespace at all', () => {
    // A URL or identifier longer than the cap. There is no good cut point; the
    // requirement is only that it finishes and respects the cap.
    const chunks = chunkText('x'.repeat(1000), { maxChars: 100, overlapChars: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(100);
    }
  });
});
