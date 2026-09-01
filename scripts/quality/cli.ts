import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { measureComplexity } from './complexity';
import { scoreCrap, type CrapScore, type FileCoverage } from './crap';
import { judge, CRAP_CEILING, type MutantReport } from './policy';

/**
 * `npm run quality -- <paths…>` — `/onkel` Mode A, the forward gate.
 *
 * The only module here that touches the filesystem or spawns a process.
 * Everything it decides is decided by the pure modules beside it, which are
 * specified by their own tests; this wires them to real coverage and a real
 * Stryker run.
 *
 * Scope is **the files one ticket touched**, which is what makes this
 * affordable: measured on this codebase, mutation over a couple of rule
 * modules is ~80 seconds, where all of `features/coach` is seven minutes.
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
 * `judge`, all of which are mutation-tested. What is exempt is the wiring
 * between them and two child processes.
 *
 * Anything added here that *decides* something belongs in a pure module beside
 * this one, not behind this exemption.
 */
export const MUTATION_EXEMPT = ['scripts/quality/cli.ts'];

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

/** One Stryker run scoped to exactly the ticket's files. */
function collectMutants(files: string[]): MutantReport[] {
  const dir = mkdtempSync(join(tmpdir(), 'onkel-mut-'));
  const configPath = join(dir, 'stryker.json');
  const reportPath = join(dir, 'mutation.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
      packageManager: 'npm',
      testRunner: 'vitest',
      // Only what the ticket touched, which is the whole affordability
      // argument — a repo-wide run is minutes, this is seconds.
      // The exemption is applied here rather than by dropping the file from
      // `files`, so it still gets a CRAP score and still appears in the report.
      mutate: files.filter((f) => !MUTATION_EXEMPT.includes(f)),
      reporters: ['json'],
      jsonReporter: { fileName: reportPath },
      tempDirName: join(dir, 'stryker-tmp'),
      coverageAnalysis: 'perTest',
      ignorePatterns: SANDBOX_IGNORE,
    }),
    'utf8',
  );

  try {
    try {
      run('npx', ['stryker', 'run', configPath]);
    } catch {
      // A non-zero exit is how Stryker reports surviving mutants. That is a
      // verdict for `judge`, not a crash — read the report and let the policy
      // decide. A genuinely broken run shows up as a missing report below.
    }

    if (!existsSync(reportPath)) {
      throw new Error(`Stryker produced no report at ${reportPath}`);
    }
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
      files: Record<
        string,
        { mutants: { location: { start: { line: number } }; mutatorName: string; status: string; statusReason?: string }[] }
      >;
    };

    return Object.entries(report.files).flatMap(([file, { mutants }]) =>
      mutants.map((m) => ({
        file: key(file),
        line: m.location.start.line,
        mutator: m.mutatorName,
        status: m.status,
        ignoreReason: m.statusReason,
      })),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
  mutants: MutantReport[],
  result: ReturnType<typeof judge>,
): number {
  const worst = [...crap].sort((a, b) => b.crap - a.crap).slice(0, 5);
  console.log('Highest CRAP:');
  for (const fn of worst) {
    console.log(
      `  ${fn.crap.toFixed(1).padStart(6)}  ${fn.file}:${fn.startLine}  ${fn.name}` +
        `  (complexity ${fn.complexity}, coverage ${(fn.coverage * 100).toFixed(0)}%)`,
    );
  }

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
export function selectFiles(argv: string[]): { files: string[]; skipped: string[] } {
  const paths = argv.filter((a) => !a.startsWith('--')).map(key);
  const files = eligible(paths);
  return { files, skipped: paths.filter((p) => !files.includes(p)) };
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const { files, skipped } = selectFiles(argv);
  if (files.length === 0 && skipped.length === 0) {
    console.error('usage: npm run quality -- <path…>   (the files this ticket touched)');
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

  const coverage = collectCoverage();
  const crap = files.flatMap((file) =>
    scoreCrap(measureComplexity(file, readFileSync(file, 'utf8')), coverage[file]),
  );
  const gradable = files.filter((f) => !MUTATION_EXEMPT.includes(f));
  const mutants = gradable.length > 0 ? collectMutants(files) : [];

  return report(
    crap,
    mutants,
    // `ranMutation` is false when every file was exempt: an empty result then
    // means "nothing to mutate", not "the run covered nothing", and the
    // no-mutants rule must not fire on it.
    judge({ crap, mutants, ranMutation: gradable.length > 0 }),
  );
}
