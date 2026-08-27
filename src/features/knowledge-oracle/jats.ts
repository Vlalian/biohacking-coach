import { XMLParser } from 'fast-xml-parser';

/**
 * Pulling readable prose out of a JATS article.
 *
 * PMC serves full text as JATS XML, which is a document format rather than a
 * data format: the meaning is in the order of mixed content, not in a tree of
 * values. `<p>Rates of <italic>up to</italic> 90 g were tolerated.</p>` collapses
 * to nonsense under a parser that discards ordering, so this one runs
 * `preserveOrder: true` and walks the ordered node list. That is the whole
 * reason this file exists rather than being three lines inside the ingest script.
 *
 * Pure: a string in, a string out. `fast-xml-parser` is already a dependency
 * (`src/features/garmin/garmin.ts:2`), so nothing new is pulled in for it.
 */

/**
 * Elements whose text must not reach a chunk.
 *
 * `ref-list` is the one issue 02 names, and it matters more than it looks:
 * a reference list is hundreds of author names and journal titles, densely
 * similar to every other reference list, which makes it the single best way to
 * poison a vector search with passages that match everything and mean nothing.
 * The rest are the same problem in smaller doses — table cells and figure
 * captions read as prose but are fragments, and `xref` is the bare citation
 * marker ("[12]") left behind mid-sentence.
 */
const SKIP = new Set([
  'ref-list',
  'ref',
  'back',
  'table-wrap',
  'table',
  'fig',
  'graphic',
  'media',
  'supplementary-material',
  'xref',
  'label',
  'funding-group',
  'ack',
  'author-notes',
  'permissions',
  'notes',
]);

/**
 * Elements that end a block of prose.
 *
 * Marked so the output carries paragraph breaks. Without them every paragraph
 * runs into the next, the sentence splitter sees one enormous run, and chunk
 * boundaries land wherever the character count happens to fall.
 */
const BLOCK = new Set(['p', 'title', 'abstract', 'sec', 'article-title']);

type OrderedNode = Record<string, unknown>;

function tagOf(node: OrderedNode): string | undefined {
  return Object.keys(node).find((key) => key !== ':@');
}

function walk(nodes: unknown, out: string[]): void {
  if (!Array.isArray(nodes)) return;

  for (const raw of nodes) {
    if (typeof raw !== 'object' || raw === null) continue;
    const node = raw as OrderedNode;
    const tag = tagOf(node);
    if (!tag) continue;

    if (tag === '#text') {
      const text = node['#text'];
      // Numbers appear here as numbers — a JATS `<p>` can be the string "2018".
      if (typeof text === 'string' || typeof text === 'number') {
        out.push(String(text));
      }
      continue;
    }

    if (SKIP.has(tag)) continue;

    walk(node[tag], out);

    if (BLOCK.has(tag)) out.push('\n\n');
  }
}

/** Depth-first search for the first node with this tag, at any depth. */
function find(nodes: unknown, tag: string): unknown {
  if (!Array.isArray(nodes)) return undefined;

  for (const raw of nodes) {
    if (typeof raw !== 'object' || raw === null) continue;
    const node = raw as OrderedNode;
    const name = tagOf(node);
    if (name === tag) return node[tag];
    const nested = find(node[name ?? ''], tag);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function collect(nodes: unknown): string {
  const parts: string[] = [];
  walk(nodes, parts);
  return parts.join('');
}

/**
 * Decode numeric character references.
 *
 * `fast-xml-parser`'s `processEntities` handles only the five XML built-ins
 * (`&amp;` and friends) — checked, not assumed: `&#x25;`, `&#x00025;` and `&#37;`
 * all come back through it verbatim. JATS from PMC writes most punctuation as
 * numeric references (`&#x02019;` for an apostrophe, `&#x02013;` for an en dash),
 * so without this every article would embed literal "&#x02019;" in its prose and
 * a passage shown to an athlete would read as markup.
 *
 * Named references beyond the XML five (`&alpha;`) are **not** decoded and arrive
 * literally. Left as-is deliberately: shipping a partial named-entity table is
 * how you get a wrong character rather than a visible one. If real corpus text
 * turns out to carry them, they will be obvious in the ingested chunks.
 */
function decodeCharacterReferences(text: string): string {
  return text.replace(/&#(x[0-9a-f]+|\d+);/gi, (whole, code: string) => {
    const point =
      code[0].toLowerCase() === 'x'
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);

    // Surrogate halves are not codepoints; `fromCodePoint` throws on them.
    const valid =
      Number.isFinite(point) &&
      point > 0 &&
      point <= 0x10ffff &&
      !(point >= 0xd800 && point <= 0xdfff);

    return valid ? String.fromCodePoint(point) : whole;
  });
}

/**
 * Collapse the whitespace JATS indentation leaves behind.
 *
 * Paragraph breaks survive; every other run of whitespace becomes one space.
 * Done at the end rather than during the walk because a text node can begin or
 * end mid-word, and trimming per node would weld words together.
 */
function tidy(text: string): string {
  return text
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n\n')
    .map((block) => block.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The abstract and body prose of a JATS article, references dropped.
 *
 * Returns an empty string for XML that is not a JATS article or has no body —
 * the caller reports the source as unfetchable rather than ingesting nothing,
 * which is issue 02's rule about never claiming a full ingest it did not do.
 */
export function extractArticleText(xml: string): string {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: true,
    // Handles the five XML built-ins only. Numeric references are dealt with
    // afterwards by `decodeCharacterReferences` — see the note there.
    processEntities: true,
    trimValues: false,
  });

  let document: unknown;
  try {
    document = parser.parse(xml);
  } catch {
    return '';
  }

  // The search starts at the `article` node, not at the whole document, because
  // `body` is not a JATS-only tag name. An HTML page has one too — and an HTML
  // page is exactly what PMC returns for a withdrawn or mistyped id. Searching
  // the document meant that page's prose came back as article text, the fetch
  // path cached it as a successful fetch, and the words of an error page would
  // be chunked, embedded, and eventually cited to an athlete as published
  // science under a real paper's attribution.
  const article = find(document, 'article');
  if (article === undefined) return '';

  const abstract = find(article, 'abstract');
  const body = find(article, 'body');

  const text = [
    abstract === undefined ? '' : collect(abstract),
    body === undefined ? '' : collect(body),
  ]
    .filter(Boolean)
    .join('\n\n');

  return tidy(decodeCharacterReferences(text));
}
