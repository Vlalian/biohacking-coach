# One worktree per implementation session

An implementation session gets its own **git worktree**, not just its own branch.
Mads's standing instruction, 2026-07-16.

    git worktree add ../biohacking-coach-<slice> -b build/<NN>-<slug>

Then work in that directory. On Windows, prefer `New-Session.ps1` — it runs this
command and also links in the gitignored docs; see
[session-scripts.md](session-scripts.md). Claude Code can do this directly too:
agents take `isolation: "worktree"`, and there is an `EnterWorktree` tool.

**A branch is not isolation.** Every session in this directory shares one `.git`
and one working tree, and the current branch is a single file — `.git/HEAD`.
Running `git checkout -b` moves *every* session in the directory onto the new
branch, mid-work, without telling them.

Rules that follow:

- Do not `git checkout` or `git checkout -b` in the shared directory while
  another session may be working. Check for recent file mtimes first; if another
  session is live, use a worktree or wait.
- Never `git add -A` when a parallel session has uncommitted work — you will
  commit theirs as yours. Stage the specific files you changed.
- If you find uncommitted work you did not write, stop and surface it. Do not
  commit it, do not revert it.

## What earned this rule

On 2026-07-16 the shared-`HEAD` problem happened three times: commits from a
parallel session landed on branches it never chose, and a review had to be
re-scoped to isolate one session's work from another's. The branching *caused*
it.
