import '../src/db/load-env';
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { count } from 'drizzle-orm';
import { getDb } from '../src/db';
import { knowledgeChunks, knowledgeSources } from '../src/db/schema';
import { callCoach, COACH_MODEL } from '../src/features/coach/coach-client';
import { openAiEmbedder } from '../src/features/knowledge-oracle/embedder';
import { EVAL_SET, type EvalGroup } from '../src/features/knowledge-oracle/eval/eval-set';
import { EVAL_ATHLETE, evalSystemPrompt } from '../src/features/knowledge-oracle/eval/fixture';
import { renderReport } from '../src/features/knowledge-oracle/eval/report';
import { runGeneration, runRetrieval } from '../src/features/knowledge-oracle/eval/run';
import { knowledgeSearch } from '../src/features/knowledge-oracle/knowledge-repository';
import { MIN_SIMILARITY, TOP_K } from '../src/features/knowledge-oracle/retrieval';

/**
 * The SAFE-3 eval run (`knowledge-oracle/06`): does the Coach cite what the
 * corpus holds, defer where it is silent, and refuse to invent under pressure?
 *
 *     npm run oracle:eval -- --label first                   # everything: ~45 embeddings + ~65 Coach calls
 *     npm run oracle:eval -- --label floor --retrieval-only  # the cheap half: embeddings only
 *     npm run oracle:eval -- --label edge --group outside    # one group
 *
 * **This costs real money and is never run by a build or by `npm test`.**
 * The retrieval half is under two cents. The generation half is on the order
 * of sixty-five Coach calls at 1,400 max tokens — a few dollars, depending on
 * the model — and its output is for a human to read: every outside and
 * adversarial reply lands under "Needs a human" for Mads to mark. Run it on
 * purpose, with a label, and read the file.
 *
 * This file is a CLI and nothing more: arguments, the real ports, the file
 * write. Everything it appears to decide lives in `src/features/knowledge-
 * oracle/eval/`, where it is tested with fakes — the same split as
 * `corpus:ingest`, `oracle:ask` and `coach:say`, and for the same reason.
 *
 * No athlete is involved. The eval athlete is a fixture, the lookup log is a
 * list in memory carrying counts only, and nothing is written to the
 * database. The one thing written down is the run itself — to `.oracle-eval/`
 * (gitignored) and to the tracker at `.scratch/knowledge-oracle/eval-runs/`,
 * because an eval whose result nobody can find later is theatre.
 */

const GROUPS: readonly EvalGroup[] = ['answerable', 'outside', 'adversarial'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function usage(): never {
  console.error(
    'Usage: npm run oracle:eval -- --label <name> [--group answerable|outside|adversarial] [--retrieval-only]\n\n' +
      'Runs the SAFE-3 question set against the live corpus and the real Coach, and\n' +
      'writes one Markdown run record. Costs embeddings and, unless --retrieval-only,\n' +
      'Coach calls. Never run this in CI.',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const label = arg('label');
  if (!label) usage();
  // `label` becomes a file name; one safe path segment, as coach-say.ts insists.
  if (!/^[A-Za-z0-9._-]+$/.test(label) || label === '.' || label === '..') {
    console.error(`Invalid --label "${label}". Use letters, digits, dot, dash or underscore.`);
    process.exit(1);
  }
  const group = arg('group');
  if (group !== undefined && !(GROUPS as readonly string[]).includes(group)) {
    console.error(`--group must be one of ${GROUPS.join(', ')}. Got: ${group}`);
    process.exit(1);
  }
  const retrievalOnly = hasFlag('retrieval-only');
  // A run is a record; a second run today under the same label is a new
  // label, not a replacement. Refuse before any money is spent.
  const date = new Date().toISOString().slice(0, 10);
  const localDir = join(process.cwd(), '.oracle-eval');
  const localPath = join(localDir, `${date}-${label}.md`);
  if (existsSync(localPath)) {
    console.error(`${localPath} already exists — pick another --label; runs are never overwritten.`);
    process.exit(1);
  }

  const set = group ? EVAL_SET.filter((c) => c.group === group) : EVAL_SET;
  const embedder = openAiEmbedder();
  const search = knowledgeSearch();

  // The corpus state and the checkout go in the header, so the run can be
  // re-judged later against the corpus it actually saw. The commit is HEAD —
  // the code that ran — not proof of which manifest Neon holds; the counts are.
  const db = getDb();
  const [{ sources }] = await db.select({ sources: count() }).from(knowledgeSources);
  const [{ chunks }] = await db.select({ chunks: count() }).from(knowledgeChunks);
  const knownSourceIds = new Set((await db.select({ id: knowledgeSources.id }).from(knowledgeSources)).map((r) => r.id));
  let headCommit = 'unknown';
  try {
    headCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // Not a git checkout, or git missing: the header says so and the run still runs.
  }

  process.stdout.write(`retrieval: ${set.filter((c) => c.group !== 'adversarial').length} questions ... `);
  const retrieval = await runRetrieval(set, { embedder, search });
  console.log('done');

  let generation: Awaited<ReturnType<typeof runGeneration>>['records'] = [];
  if (!retrievalOnly) {
    const turns = set.reduce((n, c) => n + (c.group === 'adversarial' ? 2 : 1), 0);
    process.stdout.write(`generation: ${turns} Coach calls against ${COACH_MODEL} ... `);
    const run = await runGeneration(set, {
      embedder,
      search,
      callCoach,
      system: evalSystemPrompt(),
    });
    generation = run.records;
    console.log(`done (${run.lookups.length} lookups)`);
  }

  const notes = [
    `run: ${group ?? 'all groups'}${retrievalOnly ? ', retrieval only' : ''}`,
    `athlete: the eval fixture (phase ${EVAL_ATHLETE.phase}, ${EVAL_ATHLETE.experienceLevel})`,
  ];
  const report = renderReport({
    header: {
      date,
      label,
      corpusSources: sources,
      corpusChunks: chunks,
      headCommit,
      minSimilarity: MIN_SIMILARITY,
      topK: TOP_K,
      model: retrievalOnly ? 'none (retrieval only)' : COACH_MODEL,
      notes,
    },
    retrieval,
    generation,
    knownSourceIds,
  });

  mkdirSync(localDir, { recursive: true });
  writeFileSync(localPath, report, 'utf8');
  console.log(`Written to ${localPath}`);

  // The durable copy. `.scratch/` is the tracker; a worktree without it (the
  // desktop app's, say) gets the local file only, and says so.
  const trackerDir = join(process.cwd(), '.scratch', 'knowledge-oracle', 'eval-runs');
  if (existsSync(join(process.cwd(), '.scratch', 'knowledge-oracle'))) {
    mkdirSync(trackerDir, { recursive: true });
    copyFileSync(localPath, join(trackerDir, `${date}-${label}.md`));
    console.log(`Recorded at .scratch/knowledge-oracle/eval-runs/${date}-${label}.md`);
  } else {
    console.log('No .scratch/knowledge-oracle here — copy the file into the tracker\'s eval-runs/ yourself.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
