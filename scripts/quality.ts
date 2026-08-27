import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { measureComplexity } from './quality/complexity';
import { scoreCrap, type FileCoverage } from './quality/crap';
import { judge, CRAP_CEILING, type MutantReport } from './quality/policy';

/**
 * `npm run quality -- <paths…>` — `/onkel` Mode A, the forward gate.
 *
 * The only file here that touches the filesystem or spawns a process.
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
    .map(key)
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
      mutate: files,
      reporters: ['json'],
      jsonReporter: { fileName: reportPath },
      tempDirName: join(dir, 'stryker-tmp'),
      coverageAnalysis: 'perTest',
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
        status: m.status as MutantReport['status'],
        ignoreReason: m.statusReason,
      })),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): number {
  const paths = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (paths.length === 0) {
    console.error('usage: npm run quality -- <path…>   (the files this ticket touched)');
    return 1;
  }

  const files = eligible(paths);
  const skipped = paths.map(key).filter((p) => !files.includes(p));
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
  const mutants = collectMutants(files);
  const result = judge({ crap, mutants, ranMutation: true });

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

process.exit(main());
