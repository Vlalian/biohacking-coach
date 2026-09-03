import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The gate's own shell.
 *
 * It was untested, and grading it escalated: `main` scored CRAP 56 at 0%
 * coverage. The plan made this the only module touching `fs` or spawning
 * processes, with the deciding logic in pure modules beside it — but "it is an
 * adapter" is exactly the argument every untested file makes, and the tool
 * that refuses that argument elsewhere should not accept it about itself.
 *
 * So `fs` and `child_process` are mocked and the orchestration is exercised:
 * what gets graded, what gets skipped, and which exit code a verdict produces.
 * `/build-afk` keys off that exit code, so it is the single most
 * consequential thing this module does.
 */

// Typed so a test can vary behaviour by which command was spawned.
const execFileSync = vi.fn((cmd: string, args: string[]) => `${cmd}${args.length}` && '');
const readFileSync = vi.fn();
const existsSync = vi.fn((p: string) => p.length > 0);
const writeFileSync = vi.fn();

vi.mock('node:child_process', () => ({ execFileSync }));
vi.mock('node:fs', () => ({
  execFileSync,
  readFileSync,
  existsSync,
  mkdtempSync: vi.fn(() => '/tmp/onkel-test'),
  rmSync: vi.fn(),
  writeFileSync,
}));
vi.mock('node:os', () => ({ tmpdir: () => '/tmp' }));

const { main, report, MUTATION_EXEMPT } = await import('./cli');

/** A source file with one trivial function. */
const SOURCE = 'export function f() { return 1; }';

/**
 * Three decisions, so that at 0% coverage it scores 3² + 3 = 12 and breaches
 * the ceiling. A complexity-1 function scores 2 uncovered and would not.
 */
const BRANCHY = 'export function f(a: number, b: number) { if (a) return 1; return b ? 2 : 3; }';

function coverageReport(covered = true) {
  return JSON.stringify({
    [`${process.cwd()}/src/a.ts`]: {
      statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } },
      s: { '0': covered ? 1 : 0 },
    },
  });
}

function mutationReport(statuses: string[]) {
  return JSON.stringify({
    files: {
      'src/a.ts': {
        mutants: statuses.map((status, i) => ({
          location: { start: { line: i + 1 } },
          mutatorName: 'ConditionalExpression',
          status,
        })),
      },
    },
  });
}

/** Wires the two JSON reads and the source read that `main` performs. */
function givenRun(opts: { mutants: string[]; covered?: boolean; source?: string }) {
  readFileSync.mockImplementation((path: string) => {
    if (String(path).endsWith('coverage-final.json')) return coverageReport(opts.covered ?? true);
    if (String(path).endsWith('mutation.json')) return mutationReport(opts.mutants);
    return opts.source ?? SOURCE;
  });
}

beforeEach(() => {
  execFileSync.mockClear().mockReturnValue('');
  readFileSync.mockReset();
  existsSync.mockReset().mockReturnValue(true);
  writeFileSync.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('main — the exit code /build-afk keys off', () => {
  it('exits 0 when every mutant died and nothing exceeds the ceiling', () => {
    givenRun({ mutants: ['Killed', 'Killed'] });

    expect(main(['src/a.ts'])).toBe(0);
  });

  it('exits 1 on a survivor', () => {
    givenRun({ mutants: ['Killed', 'Survived'] });

    expect(main(['src/a.ts'])).toBe(1);
  });

  it('exits 1 on a status the run never settled', () => {
    // The CodeRabbit finding, end to end: an interrupted run reports Pending,
    // and this must not read as a pass.
    givenRun({ mutants: ['Pending'] });

    expect(main(['src/a.ts'])).toBe(1);
  });

  it('exits 1 when a branchy function was never covered', () => {
    // CRAP punishes coverage cubically: three decisions untested is 12, well
    // over the ceiling, where the same function fully covered would score 3.
    givenRun({ mutants: ['Killed'], covered: false, source: BRANCHY });

    expect(main(['src/a.ts'])).toBe(1);
  });
});

describe('main — what it agrees to grade', () => {
  it('refuses to run with no paths at all', () => {
    // Grading nothing and reporting a pass is the failure this whole tool is
    // about, so an empty invocation is an error rather than a green tick.
    expect(main([])).toBe(1);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('ignores flags when deciding whether it was given paths', () => {
    expect(main(['--verbose'])).toBe(1);
  });

  it('skips .tsx, test files and paths that are not there', () => {
    // Every `{cond && <X/>}` is a decision point, so a ceiling of 6 would flag
    // most components while saying nothing about them.
    existsSync.mockReturnValue(false);

    expect(main(['src/a.tsx', 'src/a.test.ts', 'src/gone.ts'])).toBe(0);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('grades nothing, and says so, rather than passing silently', () => {
    const log = vi.spyOn(console, 'log');
    existsSync.mockReturnValue(false);

    main(['src/a.tsx']);

    expect(log.mock.calls.flat().join(' ')).toContain('Nothing to grade');
  });
});

describe('main — the Stryker run', () => {
  it('scopes mutation to the ticket, not the repo', () => {
    // The whole affordability argument: a couple of rule modules is seconds
    // where the repo is minutes.
    givenRun({ mutants: ['Killed'] });

    main(['src/a.ts']);

    const config = JSON.parse(String(writeFileSync.mock.calls[0][1]));
    expect(config.mutate).toEqual(['src/a.ts']);
  });

  it('keeps the shared junctions out of the sandbox', () => {
    // Stryker copies the project into a sandbox, and copyfile on a Windows
    // junction fails EPERM — so without this the gate does not run at all in
    // any worktree New-Session.ps1 creates.
    givenRun({ mutants: ['Killed'] });

    main(['src/a.ts']);

    const config = JSON.parse(String(writeFileSync.mock.calls[0][1]));
    expect(config.ignorePatterns).toEqual(
      expect.arrayContaining(['.scratch', '.agents', '.claude', 'poc', 'docs/agents']),
    );
  });

  it('treats a missing report as a broken run, not an empty one', () => {
    // Stryker exits non-zero when mutants survive, so a thrown command is not
    // by itself a failure — but no report at all means the run never happened,
    // and that must not read as "no mutants, all good".
    givenRun({ mutants: [] });
    existsSync.mockImplementation((p: string) => !String(p).endsWith('mutation.json'));
    // Only the Stryker call fails; the coverage run before it must still work,
    // or the test would be proving the wrong thing.
    execFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes('stryker')) throw new Error('stryker exited 1');
      return '';
    });

    expect(() => main(['src/a.ts'])).toThrow(/no report/i);
  });
});

describe('report — what a human is actually told', () => {
  const scored = (over = {}) => ({
    name: 'f',
    file: 'src/a.ts',
    startLine: 3,
    endLine: 9,
    complexity: 4,
    coverage: 0.5,
    crap: 8,
    ...over,
  });

  function output(fn: () => number): { text: string; code: number } {
    // beforeEach already spies on console.log, so the same spy carries
    // calls from earlier tests unless it is cleared here.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.mockClear();
    const code = fn();
    return { text: log.mock.calls.flat().join('\n'), code };
  }

  it('says PASS and exits 0 when the verdict passes', () => {
    const { text, code } = output(() =>
      report([], [], [], { verdict: 'pass', failures: [], suppressed: 0 }),
    );

    expect(code).toBe(0);
    expect(text).toContain('PASS');
    expect(text).not.toContain('ESCALATE');
  });

  it('says ESCALATE, counts the problems, and exits 1', () => {
    const { text, code } = output(() =>
      report([], [], [], {
        verdict: 'escalate',
        failures: [
          { kind: 'crap', name: 'big', file: 'src/a.ts', line: 3, detail: 'CRAP 8.0 exceeds the ceiling of 6' },
        ],
        suppressed: 0,
      }),
    );

    expect(code).toBe(1);
    expect(text).toContain('ESCALATE — 1 problem(s)');
    expect(text).toContain('[crap] src/a.ts:3 big — CRAP 8.0 exceeds the ceiling of 6');
  });

  it('tells the reader not to relax the gate, which is the point of the tool', () => {
    // The one instruction that stops an agent "fixing" an escalation by
    // widening the exclusions.
    const { text } = output(() =>
      report([], [], [], { verdict: 'escalate', failures: [], suppressed: 0 }),
    );

    expect(text).toContain('Do not relax the gate');
  });

  it('names the worst functions with their complexity and coverage', () => {
    const { text } = output(() =>
      report([scored(), scored({ name: 'small', crap: 1, complexity: 1, coverage: 1 })], [], [], {
        verdict: 'pass',
        failures: [],
        suppressed: 0,
      }),
    );

    expect(text).toContain('8.0  src/a.ts:3  f  (complexity 4, coverage 50%)');
    // Worst first — a reader scanning the top of the list should see the worst.
    expect(text.indexOf('  f  ')).toBeLessThan(text.indexOf('  small  '));
  });

  it('counts the kills and the suppressions', () => {
    const m = (status: string) => ({ file: 'src/a.ts', line: 1, mutator: 'X', status });
    const { text } = output(() =>
      report([], [], [m('Killed'), m('Killed'), m('Ignored')], {
        verdict: 'pass',
        failures: [],
        suppressed: 1,
      }),
    );

    expect(text).toContain('Mutants: 3 — 2 killed, 1 suppressed');
  });

  const cognitiveScore = (over = {}) => ({
    name: 'deep',
    file: 'src/a.ts',
    startLine: 12,
    endLine: 30,
    cognitive: 9,
    ...over,
  });

  it('prints cognitive complexity worst-first, and says it does not gate', () => {
    // The label is the load-bearing part. An agent that reads this as a target
    // will flatten nesting by hoisting bodies into helpers called once, which
    // moves the number without helping anyone.
    const { text } = output(() =>
      report([], [cognitiveScore(), cognitiveScore({ name: 'shallow', cognitive: 2, startLine: 40 })], [], {
        verdict: 'pass',
        failures: [],
        suppressed: 0,
      }),
    );

    expect(text).toContain('does not gate');
    expect(text).toContain('9  src/a.ts:12  deep');
    expect(text.indexOf('  deep')).toBeLessThan(text.indexOf('  shallow'));
  });

  it('passes a run whose cognitive scores are terrible', () => {
    // The diagnostic must not be able to change the exit code /build-afk keys
    // off — that is the difference between a diagnostic and a gate.
    const { code } = output(() =>
      report([], [cognitiveScore({ cognitive: 500 })], [], {
        verdict: 'pass',
        failures: [],
        suppressed: 0,
      }),
    );

    expect(code).toBe(0);
  });

  it('says nothing at all when there is nothing to report', () => {
    const { text } = output(() =>
      report([], [], [], { verdict: 'pass', failures: [], suppressed: 0 }),
    );

    expect(text).not.toContain('cognitive');
  });
});

describe('the mutation exemption', () => {
  it('covers the shell and nothing else', () => {
    // A scoping decision, so it should be small enough to read in one line.
    // If this list grows, that is the thing to argue about.
    expect(MUTATION_EXEMPT).toEqual(['scripts/quality/cli.ts']);
  });

  it('still grades an exempt file for CRAP', () => {
    // The bar is aimed, not lowered: complexity and coverage still apply here.
    givenRun({ mutants: [], covered: false, source: BRANCHY });

    expect(main(['scripts/quality/cli.ts'])).toBe(1);
  });

  it('does not report "no mutants" when every file was exempt', () => {
    // An empty result then means "nothing to mutate", not "the run covered
    // nothing" — firing the no-mutants rule on it would be a false escalation.
    givenRun({ mutants: [], covered: true });

    expect(main(['scripts/quality/cli.ts'])).toBe(0);
  });
});
