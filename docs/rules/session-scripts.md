# Session helper scripts (Windows)

Because the domain docs are gitignored (see [local-context.md](local-context.md)),
a bare `git worktree add` gives a session the code but **not** `CONTEXT.md`,
`OVERVIEW.md`, or the `.scratch/`, `docs/`, `poc/` corpus. Two PowerShell scripts
in the main folder bridge that — they keep **one** canonical copy of the docs and
link it into each session:

- **`New-Session.ps1 -Name <slug> -Branch build/<NN>-<slug>`** — creates the
  worktree off `origin/main`, junctions the doc folders back to the canonical
  copies (admin-free on Windows), and writes a gitignored `CLAUDE.md` that
  `@`-imports the worktree's own `AGENTS.md` (so a branch that changes the rules
  is read with its version) and the docs repo's `CONTEXT-BRIEF.md` by absolute
  path (it is generated and tracked there, not here). The project skills reach
  the worktree the same way: `.claude/skills` is a junction to
  `bc-docs/.claude/skills`, linked child by child with the rest of `.claude`.
  Doc edits land on the one real copy.
- **`Remove-Session.ps1 -Name <slug>`** — tears the session down. It **unlinks
  the junctions first**, then removes the worktree. This matters: a plain
  `git worktree remove` can follow the junctions and delete the canonical docs —
  always tear down with this script.

Run both from the main folder. The junctions and generated `CLAUDE.md` are
gitignored, so they never enter a PR.

Why the junctions must never be replaced by copies: [junctions.md](junctions.md).
