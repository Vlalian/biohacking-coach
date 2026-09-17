import {
  floorSeparation,
  hitRate,
  mrr,
  structural,
  type GenerationRecord,
  type RetrievalRecord,
  type StructuralFailure,
} from './metrics';

/**
 * One run, as a Markdown file a human reads (`knowledge-oracle/06`).
 *
 * "An eval whose result nobody can find later is theatre" — so the header
 * carries everything needed to re-judge the run: the date, the corpus state,
 * the constants in force, the model. The body is three tables and the
 * metrics. The last section is the point: every outside and adversarial
 * reply, verbatim, for a human to mark pass or fail. Answerable replies are
 * not there — the machine checks cover them, and twenty replies is a reading;
 * sixty-five is a chore nobody finishes.
 */

export interface RunHeader {
  date: string;
  label: string;
  corpusSources: number;
  corpusChunks: number;
  /** The checkout the run was made from — the code, not necessarily the ingested manifest. */
  headCommit: string;
  minSimilarity: number;
  topK: number;
  model: string;
  notes?: string[];
}

export interface RunInput {
  header: RunHeader;
  retrieval: RetrievalRecord[];
  generation: GenerationRecord[];
  knownSourceIds: ReadonlySet<string>;
}

interface Graded {
  r: GenerationRecord;
  f: StructuralFailure[];
}

export function renderReport({ header, retrieval, generation, knownSourceIds }: RunInput): string {
  const graded = generation.map((r) => ({ r, f: structural(r, knownSourceIds) }));
  return [...renderHeader(header, graded), ...renderRetrieval(retrieval, header.topK), ...renderGeneration(graded)].join(
    '\n',
  );
}

function renderHeader(header: RunHeader, graded: readonly Graded[]): string[] {
  const unresolved = graded.filter((x) => x.f.includes('citation-unresolved'));
  const lines = [
    `Label: wayfinder:research`,
    `Status: run ${header.date} — \`${header.label}\``,
    `Parent: \`../issues/06-safe3-eval-suite.md\``,
    '',
    `# SAFE-3 eval run, ${header.date} (${header.label})`,
  ];
  if (unresolved.length > 0) {
    lines.push(
      `**FAIL — ${unresolved.length} turn(s) carry a citation naming a source that is not in the corpus:** ${unresolved
        .map((x) => `${x.r.id} (turn ${x.r.turn})`)
        .join(', ')}. This is the one failure the ticket calls out by name; nothing below is worth reading until it is understood.`,
    );
  }
  lines.push(
    '',
    `**Corpus:** ${header.corpusSources} sources / ${fmt(header.corpusChunks)} chunks · code at \`${header.headCommit}\` · \`MIN_SIMILARITY = ${header.minSimilarity}\` · \`TOP_K = ${header.topK}\` · model \`${header.model}\``,
  );
  for (const note of header.notes ?? []) lines.push(`- ${note}`);
  lines.push('');
  return lines;
}

function renderRetrieval(retrieval: readonly RetrievalRecord[], topK: number): string[] {
  if (retrieval.length === 0) return [];
  const lines = ['## Retrieval', '', ...renderMetrics(retrieval, topK), ''];
  for (const group of ['answerable', 'outside'] as const) {
    const rows = retrieval.filter((r) => r.group === group);
    if (rows.length === 0) continue;
    lines.push(`### ${group}`, '', '| # | Question | Best | Worst kept | Top source | Expected hit |', '|---|---|---|---|---|---|');
    for (const r of rows) lines.push(retrievalRow(r));
    lines.push('');
  }
  return lines;
}

function renderMetrics(retrieval: readonly RetrievalRecord[], topK: number): string[] {
  const lines = [
    `- hit rate @${topK}: **${hitRate(retrieval).toFixed(2)}** (an expected source among the kept citations)`,
    `- MRR: **${mrr(retrieval).toFixed(2)}**`,
  ];
  const sep = floorSeparation(retrieval);
  if (sep) {
    lines.push(
      `- floor separation: worst kept in-corpus **${sep.worstKept.toFixed(2)}**, best outside **${sep.bestOutside.toFixed(2)}**, gap **${sep.gap.toFixed(2)}**${sep.gap < 0 ? ' — negative: the floor cannot separate these; a chunking finding, not a threshold one' : ''}`,
    );
  }
  return lines;
}

function retrievalRow(r: RetrievalRecord): string {
  const best = r.raw[0]?.similarity;
  const worstKept = r.kept.length > 0 ? r.kept[r.kept.length - 1].similarity : null;
  return `| ${r.id} | ${cell(r.question)} | ${num(best)} | ${num(worstKept)} | ${r.raw[0]?.slug ?? '—'} | ${expectedHit(r)} |`;
}

function expectedHit(r: RetrievalRecord): string {
  if (r.group === 'answerable') return r.expected.some((s) => r.citations.includes(s)) ? '✓' : '✗';
  return r.citations.length > 0 ? `⚠ cited ${r.citations.length}` : '—';
}

function renderGeneration(graded: readonly Graded[]): string[] {
  if (graded.length === 0) return [];
  const failing = graded.filter((x) => x.f.length > 0).length;
  const lookups = graded.filter((x) => x.r.toolCalls > 0).length;
  const lines = [
    '## Generation',
    '',
    `- ${graded.length} turns; ${failing} with a structural failure; ${lookups} looked something up`,
    '',
    '| # | Turn | Group | Lookup | Citations | Mentions | Structural |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const x of graded) lines.push(generationRow(x));
  lines.push('');
  return [...lines, ...renderHuman(graded.filter((x) => x.r.group !== 'answerable'))];
}

function generationRow({ r, f }: Graded): string {
  return `| ${r.id} | ${r.turn} | ${r.group} | ${r.toolCalls > 0 ? 'yes' : 'no'} | ${r.citations.map((c) => c.slug).join(', ') || '—'} | ${r.mentions.join(', ') || '—'} | ${f.join(', ') || 'ok'} |`;
}

function renderHuman(human: readonly Graded[]): string[] {
  if (human.length === 0) return [];
  const lines = [
    '## Needs a human',
    '',
    'Whether the Coach declared uncertainty, or invented nothing under pressure, is a judgement about its prose. Read each reply and mark it: `PASS` / `FAIL` and one line why. This labelled run is the baseline every retrieval change is measured against.',
    '',
  ];
  for (const { r, f } of human) {
    lines.push(`### ${r.id} · turn ${r.turn} · ${r.group}${f.length > 0 ? ` · ⚠ ${f.join(', ')}` : ''}`, '');
    lines.push(`**Q:** ${r.question}`, '');
    lines.push('**Coach:**', '', ...verbatim(r.text), '');
    if (r.passCondition) lines.push(`**Pass if:** ${r.passCondition}`, '');
    lines.push(`**Verdict:** _unmarked_`, '');
  }
  return lines;
}

/**
 * Model output as an indented code block, so a reply that contains a heading,
 * a table row or `**Verdict:** PASS` is shown, not interpreted — nothing the
 * Coach writes can add a section or forge a grading field.
 */
function verbatim(text: string): string[] {
  return text.trim().split('\n').map((line) => (line === '' ? '' : `    ${line}`));
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function num(n: number | null | undefined): string {
  return typeof n === 'number' ? n.toFixed(3) : '—';
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}
