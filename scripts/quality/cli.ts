import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { measureCognitive, type FunctionCognitive } from './cognitive';
import { measureComplexity } from './complexity';
import { scoreCrap, type CrapScore, type FileCoverage } from './crap';
import { judge, CRAP_CEILING, type MutantReport } from './policy';
import {
  changedRanges,
  emptyMeansMissed,
  mutateEntries,
  parseArgs,
  splitByChange,
  untrackedChange,
  type ChangedFile,
} from './scope';

/**
 * `npm run quality -- <paths…>` — `/onkel` Mode A, the forward gate.
 *
 * The only module here that touches the filesystem or spawns a process.
 * Everything it decides is decided by the pure modules beside it, which are
 * specified by their own tests; this wires them to real coverage and a real
 * Stryker run.
 *
 * Scope is **the files one ticket touched**, and within them **the lines the
 * change touched** (`.scratch/onkel/GATE-SCOPE.md`; code-health/28): Stryker
 * mutates only the changed ranges, and only functions overlapping one can fail
 * the run. The rest are measured and reported as left standing. `--whole-file`
 * grades every function, for the post-test sweep; `--base <ref>` sets what the
 * change is measured against (default: the merge-base with `origin/main`).
 *
 * `.tsx` is excluded. Every `{cond && <X/>}` is a decision point, so a ceiling
 * of 6 would flag most components while saying nothing about them; mutation
 * testing reached the same scoping conclusion independently.
 *
 * Exit code 0 means pass, 1 means escalate. `/build-afk` treats escalate the
 * way it treats a red check: stop that task, leave the work, report.
 */

const CEILING_NOTE = `CRAP ceiling ${CRAP_CEILING} (a fully covered function scores its complexity)`;

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Repo-relative, forward slashes — the key both tools agree on. */
function key(path: string): string {
  return relative(process.cwd(), resolve(path)).split('\\').join('/');
}

function eligible(paths: string[]): string[] {
  return paths
    .filter((p) => p.endsWith('.ts'))
    .filter((p) => !p.endsWith('.test.ts') && !p.endsWith('.d.ts'))
    .filter((p) => existsSync(p));
}

/** Istanbul coverage for the whole run, keyed by repo-relative path. */
function collectCoverage(): Record<string, FileCoverage> {
  const dir = mkdtempSync(join(tmpdir(), 'onkel-cov-'));
  try {
    run('npx', [
      'vitest',
      'run',
      '--coverage.enabled',
      '--coverage.provider=v8',
      '--coverage.reporter=json',
      `--coverage.reportsDirectory=${dir}`,
    ]);
    const raw = JSON.parse(readFileSync(join(dir, 'coverage-final.json'), 'utf8')) as Record<
      string,
      FileCoverage & { path?: string }
    >;
    return Object.fromEntries(Object.entries(raw).map(([file, cov]) => [key(file), cov]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Modules mutation-tested only as far as their logic, not their plumbing.
 *
 * A scoping decision, taken openly, the way `.tsx` was — not a way past a
 * failure. This module is the one place that spawns `vitest` and `stryker`,
 * and killing every mutant in it means asserting the exact flags handed to a
 * subprocess. That is implementation detail: `/tdd` in this repo asks for
 * tests that survive an internal refactor, and a test pinning `--coverage.provider=v8`
 * fails the moment someone changes how coverage is collected without changing
 * what the tool decides.
 *
 * The bar is not lowered, it is aimed. **CRAP still applies here in full** —
 * this file is graded like any other and sits under the ceiling — and the
 * decisions that matter (which files are graded, which verdict is reported,
 * which exit code `/build-afk` sees) live in `selectFiles`, `report` and
 * `judge`, all of which are mutation-tested — and since code-health/28, which
 * lines and functions count as the change, in `scope.ts`. What is exempt is
 * the wiring between them, git, and two child processes.
 *
 * Anything added here that *decides* something belongs in a pure module beside
 * this one, not behind this exemption.
 */
// `src/db/schema.ts` joined 2026-09-25 (Mads): it declares tables and decides
// nothing a mutant could test, and grading it took ~3 hours on
// garmin-integration/03 for survivors all in tables that ticket never touched.
export const MUTATION_EXEMPT = ['scripts/quality/cli.ts', 'src/db/schema.ts'];

/**
 * Paths Stryker must not copy into its sandbox.
 *
 * The first five are Windows **junctions**. `New-Session.ps1` creates them so
 * every worktree shares the one canonical tracker instead of forking it — the
 * failure that cost four divergent copies of `.scratch`. Stryker builds its
 * sandbox with `copyfile`, and `copyfile` on a junction fails `EPERM`, so the
 * run dies before a single mutant is tested. Not a slow gate: no gate at all,
 * in every worktree that script creates.
 *
 * This did not surface when the gate was built because that session ran in a
 * `.claude/worktrees/` checkout — the one shape on this machine that has no
 * `.scratch` to trip over. The gate had therefore never run against the
 * documented topology.
 *
 * `.next` is not a junction, just build output the four checks leave behind.
 * Nothing here is ever mutated, so copying it is pure cost.
 */
export const SANDBOX_IGNORE = ['.scratch', '.agents', '.claude', 'poc', 'docs/agents', '.next'];

/**
 * One Stryker run over exactly the `mutate` entries it is handed: its mutants,
 * and its log, which says how many files those entries resolved to.
 */
function collectMutants(mutate: string[]): { mutants: MutantReport[]; log: string } {
  const dir = mkdtempSync(join(tmpdir(), 'onkel-mut-'));
  const configPath = join(dir, 'stryker.json');
  const reportPath = join(dir, 'mutation.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
      packageManager: 'npm',
      testRunner: 'vitest',
      // Only what the change touched, which is the whole affordability
      // argument — see `mutateEntries` in `scope.ts`.
      mutate,
      reporters: ['json'],
      jsonReporter: { fileName: reportPath },
      tempDirName: join(dir, 'stryker-tmp'),
      coverageAnalysis: 'perTest',
      ignorePatterns: SANDBOX_IGNORE,
    }),
    'utf8',
  );

  try {
    let log = '';
    try {
      log = run('npx', ['stryker', 'run', configPath]);
    } catch (error) {
      // A non-zero exit is how Stryker reports surviving mutants. That is a
      // verdict for `judge`, not a crash — read the report and let the policy
      // decide. A genuinely broken run shows up as a missing report below.
      log = String((error as { stdout?: unknown }).stdout ?? '');
    }

    if (!existsSync(reportPath)) {
      throw new Error(`Stryker produced no report at ${reportPath}`);
    }
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
      files: Record<
        string,
        {
          mutants: {
            location: { start: { line: number } };
            mutatorName: string;
            status: string;
            statusReason?: string;
          }[];
        }
      >;
    };

    const mutants = Object.entries(report.files).flatMap(([file, { mutants }]) =>
      mutants.map((m) => ({
        file: key(file),
        line: m.location.start.line,
        mutator: m.mutatorName,
        status: m.status,
        ignoreReason: m.statusReason,
      })),
    );
    return { mutants, log };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The nesting diagnostic, printed under the gate and never part of it.
 *
 * Sorted on its own rather than folded into the CRAP rows, because the whole
 * case for the number is the function that passes CRAP comfortably while
 * nesting badly — and that function would never appear in a list ranked by
 * CRAP. If this block stays empty of anything interesting for a few weeks,
 * cyclomatic was sufficient and that is worth knowing cheaply.
 */
function reportCognitive(cognitive: FunctionCognitive[]): void {
  const worst = [...cognitive].sort((a, b) => b.cognitive - a.cognitive).slice(0, 5);
  if (worst.length === 0) return;

  console.log('\nHighest cognitive complexity (diagnostic — does not gate):');
  for (const fn of worst) {
    console.log(`  ${String(fn.cognitive).padStart(6)}  ${fn.file}:${fn.startLine}  ${fn.name}`);
  }
}

/** One CRAP row: the score, where it is, and the two numbers behind it. */
function crapLine(fn: CrapScore): string {
  return (
    `  ${fn.crap.toFixed(1).padStart(6)}  ${fn.file}:${fn.startLine}  ${fn.name}` +
    `  (complexity ${fn.complexity}, coverage ${(fn.coverage * 100).toFixed(0)}%)`
  );
}

/**
 * The functions measured but not graded, because the change did not touch
 * them. GATE-SCOPE asks for this number beside the verdict, so the post-test
 * sweep knows what it is walking into. Recorded, never failing the run.
 */
function reportStanding(standing: CrapScore[]): void {
  if (standing.length === 0) return;
  const over = standing.filter((fn) => fn.crap > CRAP_CEILING).sort((a, b) => b.crap - a.crap);
  console.log(
    `\nLeft standing (not this change): ${standing.length} function(s) not graded, ` +
      `${over.length} over the ceiling — recorded, not gating.`,
  );
  for (const fn of over) console.log(crapLine(fn));
}

/**
 * Everything the run says to a human, and the exit code that goes with it.
 *
 * Split out of `main` so both are gradable: this is the whole product of the
 * tool as far as a reader is concerned, and an unasserted message is free to
 * drift into saying nothing.
 */
export function report(
  crap: CrapScore[],
  cognitive: FunctionCognitive[],
  mutants: MutantReport[],
  result: ReturnType<typeof judge>,
  standing: CrapScore[] = [],
): number {
  const worst = [...crap].sort((a, b) => b.crap - a.crap).slice(0, 5);
  console.log('Highest CRAP:');
  for (const fn of worst) console.log(crapLine(fn));

  reportCognitive(cognitive);
  reportStanding(standing);

  const killed = mutants.filter((m) => m.status === 'Killed').length;
  console.log(`\nMutants: ${mutants.length} — ${killed} killed, ${result.suppressed} suppressed`);

  if (result.verdict === 'pass') {
    console.log('\nPASS');
    return 0;
  }

  console.log(`\nESCALATE — ${result.failures.length} problem(s):`);
  for (const f of result.failures) {
    console.log(`  [${f.kind}] ${f.file}:${f.line} ${f.name} — ${f.detail}`);
  }
  // The flow stops and asks; it never lowers its own bar.
  console.log('\nFix these or ask. Do not relax the gate.');
  return 1;
}

/** The files this run will grade, and the ones it will not. */
export function selectFiles(argv: string[]): {
  files: string[];
  skipped: string[];
} {
  const paths = parseArgs(argv).paths.map(key);
  const files = eligible(paths);
  return { files, skipped: paths.filter((p) => !files.includes(p)) };
}

/**
 * The lines of `files` this change added or modified, or null to grade whole
 * files. Null is also the answer when git cannot say — no merge-base with
 * `origin/main`, or a `--base` it cannot read — because grading more than the
 * change is the safe direction to be wrong in.
 */
function readChange(
  graded: { file: string; source: string }[],
  base: string | undefined,
): ChangedFile[] | null {
  const files = graded.map(({ file }) => file);
  try {
    const ref = base ?? run('git', ['merge-base', 'HEAD', 'origin/main']).trim();
    const diff = run('git', [
      '-c',
      'core.quotePath=false',
      'diff',
      '-U0',
      '--relative',
      '--no-color',
      '--no-ext-diff',
      ref,
      '--',
      ...files,
    ]);
    const untracked = run('git', ['ls-files', '--others', '--exclude-standard', '--', ...files])
      .split('\n')
      .map(key);
    console.log(`Scope: the lines changed since ${ref} (--whole-file grades every function)\n`);
    return [
      ...changedRanges(diff),
      ...graded
        .filter(({ file }) => untracked.includes(file))
        .map(({ file, source }) => untrackedChange(file, source)),
    ];
  } catch {
    console.log('No merge-base to measure the change against — grading whole files instead.\n');
    return null;
  }
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const { files, skipped } = selectFiles(argv);
  if (files.length === 0 && skipped.length === 0) {
    console.error(
      'usage: npm run quality -- [--whole-file] [--base <ref>] <path…>   (the files this ticket touched)',
    );
    return 1;
  }
  if (skipped.length > 0) {
    console.log(`Not graded (.tsx, tests, or missing): ${skipped.join(', ')}`);
  }
  if (files.length === 0) {
    console.log('Nothing to grade — no source .ts files in this ticket.');
    return 0;
  }

  console.log(`Grading ${files.length} file(s) — ${CEILING_NOTE}\n`);
  return grade(files, argv);
}

/** Measure everything, then let the change decide what is judged. */
function grade(files: string[], argv: string[]): number {
  const { wholeFile, base } = parseArgs(argv);
  // Read once, scored twice: both metrics parse the same text, and a second
  // read would let them disagree about a file edited mid-run.
  const graded = files.map((file) => ({
    file,
    source: readFileSync(file, 'utf8'),
  }));
  const changed = wholeFile ? null : readChange(graded, base);
  if (changed?.length === 0)
    console.log('No line of these files changed — nothing of this change to grade.\n');

  const coverage = collectCoverage();
  const { touched: crap, standing } = splitByChange(
    graded.flatMap(({ file, source }) =>
      scoreCrap(measureComplexity(file, source), coverage[file]),
    ),
    changed,
  );
  const { touched: cognitive } = splitByChange(
    graded.flatMap(({ file, source }) => measureCognitive(file, source)),
    changed,
  );
  // The exemption is applied here rather than by dropping the file from
  // `files`, so it still gets a CRAP score and still appears in the report.
  const mutate = mutateEntries(
    files.filter((f) => !MUTATION_EXEMPT.includes(f)),
    changed,
  );
  const { mutants, log } = mutate.length > 0 ? collectMutants(mutate) : { mutants: [], log: '' };

  return report(
    crap,
    cognitive,
    mutants,
    // Whether an empty result means the run missed the change, or only that
    // there was nothing to mutate — see `emptyMeansMissed`.
    judge({ crap, mutants, ranMutation: emptyMeansMissed(mutate, changed, log) }),
    standing,
  );
}
