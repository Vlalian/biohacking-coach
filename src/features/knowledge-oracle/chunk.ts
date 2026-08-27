/**
 * Turning an article into retrievable passages.
 *
 * Pure: text in, chunks out. No database, no network, no filesystem — the
 * pure-core rule in `AGENTS.md`, and the reason this file carries the heaviest
 * test coverage in the slice. Issue 02 calls chunk boundaries "the choice that
 * decides retrieval quality more than any other", which is true and also means
 * a boundary bug is invisible until an athlete reads a bad answer.
 *
 * **The numbers below are a stated guess, not a tuned result.** ~1000 characters
 * with ~150 of overlap, on sentence boundaries, per the issue-02 plan. There is
 * no way to pick them well from first principles: the right size depends on what
 * retrieval actually returns, and retrieval does not exist yet. They are
 * deliberately left alone here — tuning belongs to issue 03, where quality first
 * becomes observable. If you are about to change them, do it there, with a
 * retrieval result in front of you.
 */

export interface Chunk {
  /** Zero-based position in its source, so a chunk always resolves back. */
  ordinal: number;
  text: string;
  /**
   * Rough token count, chars/4. Good enough to report a dry run's size and to
   * catch a chunk that would blow an embedding request; not a tokeniser.
   */
  tokenEstimate: number;
}

export interface ChunkOptions {
  /** Hard cap. No returned chunk exceeds this, sentence boundaries or not. */
  maxChars?: number;
  /**
   * How much of the end of one chunk is repeated at the start of the next, so a
   * fact spanning a boundary survives in at least one whole piece.
   */
  overlapChars?: number;
}

const DEFAULTS = { maxChars: 1000, overlapChars: 150 } as const;

/**
 * Abbreviations that end in a period without ending a sentence.
 *
 * Not exhaustive and cannot be — this is a heuristic, and the failure mode is
 * benign: a missed abbreviation splits one sentence into two chunks-worth of
 * boundary, which costs a little retrieval quality and breaks nothing. The list
 * covers what actually appears in the corpus: citation prose ("et al."),
 * hedged academic writing ("e.g.", "i.e.", "cf."), and figure references.
 */
const ABBREVIATIONS = [
  'al',
  'e.g',
  'i.e',
  'cf',
  'vs',
  'etc',
  'approx',
  'fig',
  'figs',
  'tab',
  'no',
  'dr',
  'prof',
  'st',
  'ca',
];

/**
 * Split prose into sentences.
 *
 * A period ends a sentence only when whitespace follows it *and* the next
 * non-space character opens something new — a capital letter, a digit, or an
 * opening bracket or quote. That single rule handles the three cases that matter
 * in this corpus for free: decimals ("3.5 g") have no space after the period,
 * mid-sentence abbreviations ("e.g. the") are followed by lowercase, and
 * citations ("et al. (2023)") are handled by the abbreviation list, since a
 * bracket does legitimately open a sentence elsewhere.
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  const boundary = /([.!?]["')\]]?)(\s+)(?=["'(\[]?[A-Z0-9])/g;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(text)) !== null) {
    const end = match.index + match[1].length;
    const candidate = text.slice(start, end);

    // The word carrying the period. If it is a known abbreviation, this is not a
    // sentence end and the scan continues through it.
    const lastWord = candidate
      .slice(0, -1)
      .split(/[\s(]/)
      .pop()
      ?.toLowerCase()
      .replace(/^[^a-z.]+/, '');

    if (lastWord && ABBREVIATIONS.includes(lastWord)) continue;

    const trimmed = candidate.trim();
    if (trimmed) sentences.push(trimmed);
    start = end + match[2].length;
  }

  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);

  return sentences;
}

/**
 * Break a run of text too long to be one chunk, at whitespace.
 *
 * Only reached when a single "sentence" exceeds `maxChars` — in practice a
 * reference blob, a table flattened into prose, or a missing period. Splitting
 * mid-sentence is the lesser evil against emitting a chunk the embedder rejects,
 * but it is the one path that can produce a chunk starting mid-sentence, which
 * is why it is isolated here rather than folded into the packing loop.
 */
function hardSplit(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = text;

  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const cut = window.lastIndexOf(' ');
    // No whitespace at all in a whole window: an unbroken token (a URL, a long
    // identifier). Cut it at the cap instead.
    const wanted = cut > maxChars / 2 ? cut : maxChars;

    // **The loop's termination lives on this line.** It advances only by what
    // `at` consumes, and every `wanted` above is derived from `maxChars`, so a
    // `maxChars` of 0 made `at` 0: `rest` was reassigned to itself and this ran
    // until the process died on memory rather than raising anything. Validation
    // in `chunkText` now rejects that, and this is the second lock — a cut of at
    // least one character cannot fail to shorten `rest`, whatever a future
    // caller or a future `wanted` does.
    const at = Math.max(1, Math.min(wanted, rest.length));

    pieces.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }

  if (rest) pieces.push(rest);
  return pieces;
}

function toChunk(text: string, ordinal: number): Chunk {
  return { ordinal, text, tokenEstimate: Math.ceil(text.length / 4) };
}

/**
 * Chunk an article's text into overlapping, sentence-aligned passages.
 *
 * Greedy: sentences are packed into a chunk until the next one would exceed the
 * cap, then the chunk is emitted and the next one begins with the tail of the
 * one before it. Text shorter than the cap comes back as a single chunk,
 * unmodified apart from trimming.
 */
export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? DEFAULTS.maxChars;
  const overlapChars = options.overlapChars ?? DEFAULTS.overlapChars;

  // Rejected here rather than survived downstream. These two numbers set how far
  // every loop below advances, so a nonsensical one does not produce a bad chunk
  // — it produces no chunk, forever. A `maxChars` of 0 used to run until the
  // process died on memory, reporting nothing, on a script whose whole job is to
  // run unattended over 31 sources.
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error(
      `chunkText: maxChars must be a whole number of at least 1, got ${maxChars}. ` +
        'It is the cap every chunk is measured against and the distance the ' +
        'splitter advances by; below 1 there is no chunk to emit.',
    );
  }

  if (!Number.isInteger(overlapChars) || overlapChars < 0) {
    throw new Error(
      `chunkText: overlapChars must be a whole number of 0 or more, got ${overlapChars}.`,
    );
  }

  if (overlapChars >= maxChars) {
    throw new Error(
      `chunkText: overlapChars (${overlapChars}) must be smaller than maxChars ` +
        `(${maxChars}) — an overlap that fills a chunk leaves no room for new ` +
        'material, so the same text would repeat without the loop advancing.',
    );
  }

  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [toChunk(trimmed, 0)];

  const sentences = splitSentences(trimmed).flatMap((s) =>
    s.length > maxChars ? hardSplit(s, maxChars) : [s],
  );

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentLength = 0;

  /**
   * The trailing sentences of the chunk just emitted, up to `overlapChars`.
   *
   * Capped at half the chunk so overlap can never fill a chunk on its own — that
   * would leave no room for new material and the loop would not advance.
   */
  const overlapFrom = (sentencesInChunk: string[]): string[] => {
    const tail: string[] = [];
    let length = 0;

    for (let i = sentencesInChunk.length - 1; i >= 0; i--) {
      const next = length + sentencesInChunk[i].length + 1;
      if (next > overlapChars || next > maxChars / 2) break;
      tail.unshift(sentencesInChunk[i]);
      length = next;
    }

    return tail;
  };

  for (const sentence of sentences) {
    const wouldBe = currentLength + (current.length ? 1 : 0) + sentence.length;

    if (current.length && wouldBe > maxChars) {
      chunks.push(toChunk(current.join(' '), chunks.length));

      // Carrying the tail forward is a nicety; the cap is a guarantee. When the
      // restored overlap plus the sentence that triggered this emit would not
      // fit, the overlap goes — it used to be kept and the sentence appended
      // anyway, which produced chunks over the cap (a 140-char tail before a
      // 950-char sentence made 1,091 against a 1,000 cap).
      //
      // Dropped whole rather than trimmed: every sentence here is already at
      // most `maxChars` (long ones went through `hardSplit`), so a chunk that
      // starts empty always fits, while a partial overlap would need the same
      // arithmetic done a second way to prove it.
      const overlap = overlapFrom(current);
      const withOverlap =
        overlap.join(' ').length + (overlap.length ? 1 : 0) + sentence.length;

      current = withOverlap > maxChars ? [] : overlap;
      currentLength = current.join(' ').length;
    }

    current.push(sentence);
    currentLength = current.join(' ').length;
  }

  if (current.length) chunks.push(toChunk(current.join(' '), chunks.length));

  return chunks;
}
