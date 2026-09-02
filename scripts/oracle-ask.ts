import '../src/db/load-env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openAiEmbedder } from '../src/features/knowledge-oracle/embedder';
import { knowledgeSearch } from '../src/features/knowledge-oracle/knowledge-repository';
import { retrievePassages, TOP_K } from '../src/features/knowledge-oracle/retrieval';

/**
 * What does retrieval actually return?
 *
 * The same reasoning `coach-say.ts` states for the Coach, applied to the
 * Knowledge Oracle. The unit tests prove `retrievePassages` ranks by the number
 * the search gave it. **No test can tell you whether the passages are any good** —
 * that is a judgement about 1,583 chunks of real training science, and it needs a
 * human reading real output.
 *
 *     npm run oracle:ask -- "How should training load be distributed in a base phase?"
 *     npm run oracle:ask -- "..." --phase build --xp veteran --k 10 --label before
 *
 * Deliberately NOT a test:
 *
 *   - It costs a real embedding call and a real database query, so it must never
 *     run in `npm test`. One `text-embedding-3-small` call is a fraction of a
 *     cent, but it is not free and it needs a network.
 *   - The corpus changes when it is re-ingested. There is no assertion that
 *     could be both meaningful and stable.
 *   - The output is for a human to read.
 *
 * ## Setting MIN_SIMILARITY — run it below the floor, not just above it
 *
 * The point that decides the threshold: **the floor is set by what a non-match
 * scores, not by what a match scores.** A question squarely in the corpus scores
 * well whatever the threshold is; what you need to know is where irrelevant
 * material lands, because the floor has to sit above that.
 *
 * So run this fixed set, and keep it fixed so runs stay comparable:
 *
 *   1. In corpus     — "How should training load be distributed in a base phase?"
 *                      If this returns nothing useful, retrieval is broken.
 *   2. Adjacent      — "What should I eat the night before a long ride?"
 *                      Nutrition timing is in scope but thinner. Tests the middle.
 *   3. Out of corpus — "Should I buy carbon-plated running shoes?"
 *                      THIS is the one that sets the floor. Whatever it scores,
 *                      MIN_SIMILARITY goes above it, or the Coach will cite a
 *                      periodization paper at a shoe question.
 *   4. Safety-shaped — "I get chest pain on every run, should I push through?"
 *                      Read what comes back. Grounding a medical question in
 *                      endurance-training papers is worse than returning nothing.
 *                      If the corpus answers this confidently, that is a finding
 *                      for knowledge-oracle/06 — write it up, do not tune it away.
 *
 * What to read for: relevance; where the similarity *cliff* is (that gap is the
 * floor — and if there is no cliff, say so, because it means cosine similarity
 * is not separating this corpus and that is a finding about the chunking);
 * whether one paper supplies every hit; and whether TOP_K is the right shape.
 *
 * No athlete is involved. The query is built by `buildOracleQuery`, which runs
 * the same identifier assertion as production and has no field that could carry
 * a name — running this cannot send anyone's data anywhere.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function preview(text: string, chars = 300): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= chars ? flat : `${flat.slice(0, chars)}…`;
}

async function main(): Promise<void> {
  // The question is the first bare argument — everything before the first `--`.
  const question = process.argv.slice(2).find((a) => !a.startsWith('--'));

  if (!question) {
    console.error(
      'Usage: npm run oracle:ask -- "<question>" [--phase base] [--xp veteran] [--k 6] [--label name]\n\n' +
        'Embeds the query with the real OpenAI embedder, searches the live corpus,\n' +
        'and prints ranked passages with their similarity plus the athlete-facing\n' +
        'citation list. Costs one embedding call. Never run this in CI.',
    );
    process.exitCode = 1;
    return;
  }

  const topK = Number(arg('k') ?? TOP_K);
  const query = {
    question,
    phase: arg('phase'),
    experienceLevel: arg('xp'),
  };

  const result = await retrievePassages({
    embedder: openAiEmbedder(),
    search: knowledgeSearch(),
    query,
    topK,
    // Deliberately floored at zero rather than at MIN_SIMILARITY: this tool
    // exists to show you what the weak matches score, and a run that hid them
    // could not tell you where to put the threshold.
    minSimilarity: 0,
  });

  const lines: string[] = [
    `# ${question}`,
    '',
    `phase=${query.phase ?? '—'}  xp=${query.experienceLevel ?? '—'}  k=${topK}`,
    `passages=${result.passages.length}  sources=${result.citations.length}`,
    '',
    '## Ranked passages',
    '',
  ];

  if (result.passages.length === 0) {
    lines.push('_Nothing returned. An empty corpus, or a question nothing matched._', '');
  }

  result.passages.forEach((passage, i) => {
    const cite = result.citations.find((c) => c.sourceId === passage.sourceId);
    lines.push(
      `### ${i + 1}. similarity ${passage.similarity.toFixed(3)}`,
      `*${cite?.title ?? 'unknown source'}* (${cite?.year ?? '—'}) — chunk ${passage.ordinal}`,
      '',
      preview(passage.text),
      '',
    );
  });

  // The reference list exactly as the athlete would meet it. Worth reading on
  // every run: "What I drew on" is an honest label for a list that cannot say
  // which claim came from which paper, and it is nearly free to check here.
  lines.push('## What I drew on', '');
  result.citations.forEach((c) => {
    lines.push(
      `- **${c.title}** — ${c.authors} (${c.year}). ` +
        `${c.url ?? '_no stable link_'} · chunks ${c.ordinals.join(', ')} · ${c.licence}`,
    );
  });
  lines.push('');

  const out = lines.join('\n');
  console.log(out);

  const label = arg('label');
  if (label) {
    if (!/^[A-Za-z0-9._-]+$/.test(label) || label === '.' || label === '..') {
      console.error(
        `Invalid --label "${label}". Use letters, digits, dot, dash or underscore.`,
      );
      process.exitCode = 1;
      return;
    }
    const outDir = join(process.cwd(), '.oracle-ask');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${label}.md`), out, 'utf8');
    console.log(`Written to .oracle-ask/${label}.md`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
