/**
 * Runs the Neon CLI with the given arguments and returns its stdout; throws
 * when the command is missing or exits non-zero. The one port this module has.
 */
export type NeonRunner = (args: string[]) => string;

export type BranchReset = {
  branch: string;
  branchId: string;
  parentId: string;
  parentName: string;
};

/**
 * Resets a Neon branch to its parent so a run starts from the parent's rows
 * exactly (frontend-quality/08): the page suite's `test/e2e` is a child of
 * `seed-template`, and `scripts/seed.ts` only converges the Coach-origin
 * rows, so anything else a run wrote — an Athlete Session, a check-in, a
 * conversation — would otherwise carry into the next run's pictures.
 *
 * The parent's name comes back so the caller can print it: a branch quietly
 * re-parented under a dev branch would reset to somebody's live data and
 * nothing would say so. A reset does not change the branch's connection
 * string (checked 2026-09-18), so `E2E_DATABASE_URL` stays valid.
 *
 * A missing CLI is an error with the install hint, not a skipped reset: the
 * suite's promise is that every run starts from the same rows.
 */
export function resetBranchToParent(branch: string, neon: NeonRunner): BranchReset {
  try {
    neon(['--version']);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `The Neon CLI is not installed, so the page suite cannot reset its branch ${branch} ` +
        'before seeding. Install it with `npm install -g neonctl` and sign in with ' +
        `\`neon auth\`. (${detail.trim()})`,
    );
  }

  const reset = JSON.parse(neon(['branches', 'reset', branch, '--parent', '-o', 'json'])) as {
    id: string;
    parent_id?: string;
  };
  if (!reset.parent_id) {
    throw new Error(`Neon branch ${branch} (${reset.id}) has no parent to reset to.`);
  }

  const parent = JSON.parse(neon(['branches', 'get', reset.parent_id, '-o', 'json'])) as {
    name: string;
  };

  return { branch, branchId: reset.id, parentId: reset.parent_id, parentName: parent.name };
}
