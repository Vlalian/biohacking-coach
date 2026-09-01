import '../src/db/load-env';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractArticleText } from '../src/features/knowledge-oracle/jats';
import {
  admittedSources,
  type CorpusSource,
} from '../src/features/knowledge-oracle/corpus-manifest';
import {
  ingestCorpus,
  formatReport,
} from '../src/features/knowledge-oracle/ingest';
import { openAiEmbedder } from '../src/features/knowledge-oracle/embedder';
import {
  knowledgeRepository,
  offlineRepository,
} from '../src/features/knowledge-oracle/knowledge-repository';

/**
 * Turn the approved corpus into searchable vectors.
 *
 *     npm run corpus:ingest                 # dry run: what it WOULD ingest
 *     npm run corpus:ingest -- --fetch      # pull article XML from PMC, cache it
 *     npm run corpus:ingest -- --live       # embed and write. Costs money.
 *
 * **Dry run is the default, and that is a safety property, not a convenience.**
 * Embedding costs money per run, and an unattended build must never reach
 * `--live`. The dry run is proved free by a test that passes an embedder which
 * throws if it is called — not by this comment.
 *
 * This file is a CLI and nothing more: argument parsing, the filesystem, the
 * network, and printing. Every decision it appears to make lives in
 * `src/features/knowledge-oracle/`, where it is tested. That split is why the
 * behaviour can be tested at all — vitest only collects `src/**`.
 */

/** Gitignored. Article XML is cached here so a re-run does not re-fetch. */
const CACHE_DIR = '.corpus-cache';

/**
 * PMC's E-utilities endpoint.
 *
 * The corpus is sourced from the PMC Open Access Subset, so this is the
 * publisher's own API rather than scraping — which matters beyond politeness:
 * issue 01's whole finding is that an article page can omit the licence its
 * publisher's policy states, so the pipeline fetches only sources whose licence
 * a human already read and recorded.
 */
const EFETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

/** Be a good citizen of a free public API: one request at a time, spaced out. */
const FETCH_DELAY_MS = 400;
const FETCH_TIMEOUT_MS = 30_000;

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function cachePath(slug: string): string {
  return join(CACHE_DIR, `${slug}.xml`);
}

/**
 * Fetch one article's JATS XML into the cache.
 *
 * Returns false rather than throwing. Issue 02's rule: a source that cannot be
 * fetched is reported and the run moves on — never a retry loop, never a hang,
 * never a guess. PMC already 403'd twice during issue 01, for other publishers,
 * so this is an expected outcome and not an exceptional one.
 */
async function fetchSource(source: CorpusSource): Promise<boolean> {
  if (!source.pmcid) {
    console.log(`  skip   ${source.slug} — no pmcid recorded`);
    return false;
  }

  const url = `${EFETCH}?db=pmc&id=${source.pmcid}&retmode=xml`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        // Named honestly. NCBI asks that automated clients identify themselves.
        'User-Agent': 'biohacking-coach-corpus-ingest/1.0 (Knowledge Oracle)',
      },
    });

    if (!response.ok) {
      console.log(`  FAIL   ${source.slug} — HTTP ${response.status} from PMC`);
      return false;
    }

    const xml = await response.text();
    const text = extractArticleText(xml);

    if (!text.trim()) {
      // A 200 with no extractable body is the quiet failure mode: PMC returns an
      // error document with a success status for some ids. Caching it would
      // store an empty source that every later run treats as fetched.
      console.log(
        `  EMPTY  ${source.slug} — PMC returned no article body (open access ` +
          'subset may not carry full text for this id)',
      );
      return false;
    }

    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(source.slug), xml, 'utf8');
    console.log(`  ok     ${source.slug} — ${text.length} chars of prose`);
    return true;
  } catch (error) {
    console.log(
      `  FAIL   ${source.slug} — ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Read a source's cached prose.
 *
 * The cache holds raw XML rather than extracted text on purpose: extraction is
 * code that will improve (`jats.ts`), and re-extracting locally is free while
 * re-fetching is not.
 */
async function readCachedText(slug: string): Promise<string | null> {
  const path = cachePath(slug);
  if (!existsSync(path)) return null;
  return extractArticleText(readFileSync(path, 'utf8'));
}

async function main(): Promise<void> {
  const live = hasFlag('live');
  const sources = admittedSources();

  console.log(`Knowledge Oracle corpus — ${sources.length} admitted sources\n`);

  if (hasFlag('fetch')) {
    console.log('Fetching article XML from PMC:\n');
    for (const source of sources) {
      await fetchSource(source);
      await new Promise((resolve) => setTimeout(resolve, FETCH_DELAY_MS));
    }
    console.log('');
  }

  // A dry run must work on a machine that has never seen the database, so the
  // repository is only demanded when there is something to write. The trade is
  // stated rather than hidden: without it, "unchanged" cannot be detected and
  // every cached source reports as ready.
  const hasDatabase = Boolean(process.env.DATABASE_URL);
  const repository = live || hasDatabase ? knowledgeRepository() : offlineRepository();

  if (!live && !hasDatabase) {
    console.log(
      'No DATABASE_URL — planning offline. Sources already ingested will still\n' +
        'show as "ready"; they would be skipped on a run that can see the database.\n',
    );
  }

  const report = await ingestCorpus({
    sources,
    readText: readCachedText,
    repository,
    embedder: openAiEmbedder(),
    live,
  });

  console.log(formatReport(report).join('\n'));

  if (!live) {
    console.log('\nRe-run with --live to embed and write. This costs money.');
  }

  // A run that could not read every source did not ingest the corpus, and must
  // not exit as though it had — this is what stops a half-corpus from being
  // reported to a later reader as a complete one.
  if (report.missing.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
