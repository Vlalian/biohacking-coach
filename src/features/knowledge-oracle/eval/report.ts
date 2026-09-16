import { floorSeparation, hitRate, mrr, structural, type GenerationRecord, type RetrievalRecord } from './metrics';

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
  manifestCommit: string;
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

export function renderReport({ header, retrieval, generation, knownSourceIds }: RunInput): string {
  const failures = generation.map((r) => ({ r, f: structural(r, knownSourceIds) }));
  const unresolved = failures.filter((x) => x.f.includes('citation-unresolved'));
  const lines: string[] = [];

  lines.push(`Label: wayfinder:research`);
  lines.push(`Status: run ${header.date} — \`${header.label}\``);
  lines.push(`Parent: \`../issues/06-safe3-eval-suite.md\``);
  lines.push('');
  lines.push(`# SAFE-3 eval run, ${header.date} (${header.label})`);
  if (unresolved.length > 0) {
    lines.push(
      `**FAIL — ${unresolved.length} citation(s) name a source that is not in the corpus:** ${unresolved
        .map((x) => `${x.r.id} (turn ${x.r.turn})`)
        .join(', ')}. This is the one failure the ticket calls out by name; nothing below is worth reading until it is understood.`,
    );
  }
  lines.push('');
  lines.push(
    `**Corpus:** ${header.corpusSources} sources / ${fmt(header.corpusChunks)} chunks · manifest at \`${header.manifestCommit}\` · \`MIN_SIMILARITY = ${header.minSimilarity}\` · \`TOP_K = ${header.topK}\` · model \`${header.model}\``,
  );
  for (const note of header.notes ?? []) lines.push(`- ${note}`);
  lines.push('');

  // ── Retrieval ───────────────────────────────────────────────────────────────
  if (retrieval.length > 0) {
    const sep = floorSeparation(retrieval);
    lines.push('## Retrieval');
    lines.push('');
    lines.push(`- hit rate @${header.topK}: **${hitRate(retrieval).toFixed(2)}** (an expected source among the kept citations)`);
    lines.push(`- MRR: **${mrr(retrieval).toFixed(2)}**`);
    if (sep) {
      lines.push(
        `- floor separation: worst kept in-corpus **${sep.worstKept.toFixed(2)}**, best outside **${sep.bestOutside.toFixed(2)}**, gap **${sep.gap.toFixed(2)}**${sep.gap < 0 ? ' — negative: the floor cannot separate these; a chunking finding, not a threshold one' : ''}`,
      );
    }
    lines.push('');
    for (const group of ['answerable', 'outside'] as const) {
      const rows = retrieval.filter((r) => r.group === group);
      if (rows.length === 0) continue;
      lines.push(`### ${group}`);
      lines.push('');
      lines.push('| # | Question | Best | Worst kept | Top source | Expected hit |');
      lines.push('|---|---|---|---|---|---|');
      for (const r of rows) {
        const best = r.raw[0]?.similarity;
        const worstKept = r.kept.length > 0 ? r.kept[r.kept.length - 1].similarity : null;
        const hit = group === 'answerable' ? (r.expected.some((s) => r.citations.includes(s)) ? '✓' : '✗') : r.citations.length > 0 ? `⚠ cited ${r.citations.length}` : '—';
        lines.push(
          `| ${r.id} | ${cell(r.question)} | ${num(best)} | ${num(worstKept)} | ${r.raw[0]?.slug ?? '—'} | ${hit} |`,
        );
      }
      lines.push('');
    }
  }

  // ── Generation ──────────────────────────────────────────────────────────────
  if (generation.length > 0) {
    lines.push('## Generation');
    lines.push('');
    const total = failures.filter((x) => x.f.length > 0).length;
    lines.push(`- ${generation.length} turns; ${total} with a structural failure; ${generation.filter((r) => r.toolCalls > 0).length} looked something up`);
    lines.push('');
    lines.push('| # | Turn | Group | Lookup | Citations | Mentions | Structural |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const { r, f } of failures) {
      lines.push(
        `| ${r.id} | ${r.turn} | ${r.group} | ${r.toolCalls > 0 ? 'yes' : 'no'} | ${r.citations.map((c) => c.slug).join(', ') || '—'} | ${r.mentions.join(', ') || '—'} | ${f.join(', ') || 'ok'} |`,
      );
    }
    lines.push('');

    const human = failures.filter((x) => x.r.group !== 'answerable');
    if (human.length > 0) {
      lines.push('## Needs a human');
      lines.push('');
      lines.push(
        'Whether the Coach declared uncertainty, or invented nothing under pressure, is a judgement about its prose. Read each reply and mark it: `PASS` / `FAIL` and one line why. This labelled run is the baseline every retrieval change is measured against.',
      );
      lines.push('');
      for (const { r, f } of human) {
        lines.push(`### ${r.id} · turn ${r.turn} · ${r.group}${f.length > 0 ? ` · ⚠ ${f.join(', ')}` : ''}`);
        lines.push('');
        lines.push(`**Q:** ${r.question}`);
        lines.push('');
        lines.push(`**Coach:** ${r.text.trim()}`);
        lines.push('');
        lines.push(`**Verdict:** _unmarked_`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
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
