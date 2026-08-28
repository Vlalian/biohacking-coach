/**
 * `/onkel` Mode A — the forward flow's gates, as a pure function.
 *
 * Mode A grades code written test-first, one ticket at a time, against a
 * standard known before it was written. So the gates are **absolute**: there
 * is no legacy here to be fair to, and "not worse than yesterday" is
 * meaningless for a function that did not exist yesterday. (Mode B, the
 * ratchet for the code already here, is a separate policy and is not built —
 * see `.scratch/onkel/PLAN.md`.)
 *
 * The verdict is computed from recorded numbers, and the agent obeys it. This
 * matters more than it looks: an agent allowed to judge whether its own work
 * is good enough has a very cheap way to decide that it is.
 *
 * There is no "close enough" verdict on purpose. Either the bar is met, or the
 * flow stops and asks — it never lowers its own bar.
 */

/**
 * Because a fully covered function scores exactly its complexity, this is in
 * effect a complexity cap of 6 on tested code. That is the intent.
 */
export const CRAP_CEILING = 6;

export type CrapScore = {
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  crap: number;
};

/**
 * Statuses that mean the mutant was conclusively dealt with.
 *
 * `Timeout` counts as a kill — the mutant hung and the tests noticed.
 * `CompileError` is a mutant TypeScript rejected, so it never ran and says
 * nothing about the tests; Stryker excludes it from the score for the same
 * reason.
 */
const CONCLUSIVE_KILLS = new Set(['Killed', 'Timeout', 'CompileError']);

/** The part of Stryker's report this needs, per mutant. */
export type MutantReport = {
  file: string;
  line: number;
  mutator: string;
  /**
   * Stryker's status, deliberately typed as `string` rather than a union.
   *
   * This is data from another tool. The schema's enum today is Killed,
   * Survived, NoCoverage, CompileError, RuntimeError, Timeout, Ignored and
   * Pending — but a value this build has never seen has to arrive at the
   * policy *as itself* so it can be refused, not be cast into something it is
   * not. It was a union until CodeRabbit pointed out that `quality.ts` was
   * force-casting into it: an interrupted run emits `Pending`, which fell
   * through every branch and reported PASS. That is the same shape as the
   * `no-mutants` hole — absence of evidence reading as evidence.
   */
  status: string;
  /** Required when `status` is `Ignored`. */
  ignoreReason?: string;
};

export type Failure =
  | { kind: 'crap'; name: string; file: string; line: number; detail: string }
  | { kind: 'mutant'; name: string; file: string; line: number; mutator: string; detail: string }
  | {
      kind: 'unexplained-suppression';
      name: string;
      file: string;
      line: number;
      mutator: string;
      detail: string;
    }
  | { kind: 'no-mutants'; name: string; file: string; line: number; detail: string }
  | {
      kind: 'inconclusive';
      name: string;
      file: string;
      line: number;
      mutator: string;
      detail: string;
    };

export type Verdict = {
  verdict: 'pass' | 'escalate';
  failures: Failure[];
  /** Mutants suppressed with a reason. Reported so they cannot creep. */
  suppressed: number;
};

function isExplainedSuppression(m: MutantReport): boolean {
  return (
    m.status === 'Ignored' && m.ignoreReason !== undefined && m.ignoreReason.trim() !== ''
  );
}

/** Functions whose CRAP is over the ceiling. */
function crapFailures(scores: CrapScore[]): Failure[] {
  return scores
    .filter((fn) => fn.crap > CRAP_CEILING)
    .map((fn) => ({
      kind: 'crap' as const,
      name: fn.name,
      file: fn.file,
      line: fn.startLine,
      detail: `CRAP ${fn.crap.toFixed(1)} exceeds the ceiling of ${CRAP_CEILING}`,
    }));
}

/**
 * A mutant that should have died and did not — or was suppressed without
 * saying why, which is a quieter way of failing and would otherwise be the
 * cheapest route past this gate.
 */
function mutantFailure(m: MutantReport): Failure | null {
  const where = { name: m.mutator, file: m.file, line: m.line, mutator: m.mutator };

  if (m.status === 'Ignored') {
    return isExplainedSuppression(m)
      ? null
      : { kind: 'unexplained-suppression', ...where, detail: 'suppressed with no reason given' };
  }

  // NoCoverage is a survivor that never had to try.
  if (m.status === 'NoCoverage') {
    return { kind: 'mutant', ...where, detail: 'no test reaches this' };
  }
  if (m.status === 'Survived') {
    return { kind: 'mutant', ...where, detail: 'survived' };
  }
  if (CONCLUSIVE_KILLS.has(m.status)) return null;

  // Everything else — `RuntimeError`, `Pending` from an interrupted run, or a
  // status a later Stryker introduces — is a mutant nobody can say was caught.
  // Fail closed: the whole value of this gate is that it does not pass on the
  // absence of evidence.
  return {
    kind: 'inconclusive',
    ...where,
    detail: `status "${m.status}" is neither a kill nor a survival — the run did not settle this mutant`,
  };
}

export function judge(input: {
  crap: CrapScore[];
  mutants: MutantReport[];
  /** Whether a mutation run happened at all; an empty result is only
   *  meaningful if one did. */
  ranMutation?: boolean;
}): Verdict {
  const failures: Failure[] = [
    ...crapFailures(input.crap),
    ...input.mutants.map(mutantFailure).filter((f): f is Failure => f !== null),
  ];

  // An empty mutation result reads exactly like a perfect one, and is not one:
  // it means the run never touched what the ticket changed.
  if (input.ranMutation === true && input.mutants.length === 0) {
    failures.push({
      kind: 'no-mutants',
      name: '(none)',
      file: '(all)',
      line: 0,
      detail: 'the mutation run produced no mutants — it did not cover the ticket',
    });
  }

  return {
    verdict: failures.length === 0 ? 'pass' : 'escalate',
    failures,
    suppressed: input.mutants.filter(isExplainedSuppression).length,
  };
}
