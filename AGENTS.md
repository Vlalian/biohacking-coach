## Working rules

### Review code before committing it

Run the `/code-review` skill on product code before committing it, and before opening a pull request. Mads's standing instruction, 2026-07-16.

This applies to **code** — `src/`, `scripts/`, config that affects the build. It does not apply to tracker files, ADRs, PRDs, or issue markdown; reviewing prose with a code-review skill wastes a session and teaches you to ignore the rule.

Fix what the review finds, or say plainly why you are not fixing it. A review whose findings you skip silently is theatre.

This is an instruction, not an enforced hook: no hook can verify a skill ran, only that a command was typed. `.claude/hooks/block-dangerous-git.sh` is the enforced layer and it guards different things (force pushes, hard resets, bulk discards). Do not confuse the two — this one holds only because agents follow it.

CodeRabbit reviews every PR on GitHub as well. That is the second pair of eyes, not the first: it runs after the code is pushed, and the point of this rule is to not push work you already know is wrong.

### One worktree per implementation session

An implementation session gets its own **git worktree**, not just its own branch. Mads's standing instruction, 2026-07-16.

    git worktree add ../biohacking-coach-<slice> -b build/<NN>-<slug>

Then work in that directory. Claude Code can do this directly: agents take `isolation: "worktree"`, and there is an `EnterWorktree` tool.

**A branch is not isolation.** Every session in this directory shares one `.git` and one working tree, and the current branch is a single file — `.git/HEAD`. Running `git checkout -b` moves *every* session in the directory onto the new branch, mid-work, without telling them. On 2026-07-16 that happened three times: commits from a parallel session landed on branches it never chose, and a review had to be re-scoped to isolate one session's work from another's. The branching *caused* it.

Rules that follow:

- Do not `git checkout` or `git checkout -b` in the shared directory while another session may be working. Check for recent file mtimes first; if another session is live, use a worktree or wait.
- Never `git add -A` when a parallel session has uncommitted work — you will commit theirs as yours. Stage the specific files you changed.
- If you find uncommitted work you did not write, stop and surface it. Do not commit it, do not revert it.

## Code standards

### Coding conventions

- **Use the domain language exactly.** `CONTEXT.md` is the glossary — Weekly Session, Week Plan, Session Reflection, Coached Mode, and the rest. Name things in code the way `CONTEXT.md` names them; do not drift to synonyms.
- **Keep a pure core, push I/O to the edges.** Business logic (the deterministic calc module, prompt rendering) is framework-free and takes plain data in, returns plain data out — no DB calls, no HTTP, no `fetch` inside it. Wrap the outside world (Postgres/Drizzle, the Anthropic API, the UI) in thin adapters that call the core. Dependencies flow one way, toward the core; the core imports nothing from features, UI, or the database layer. The full rationale is in [.scratch/research/codebase-structure-guidelines.md](.scratch/research/codebase-structure-guidelines.md).
- **Respect the architecture that is already decided.** The server owns the truth (ADR 0006): no module reads browser `bh_*` keys, nothing durable is device-only, the Anthropic key is a server secret and never ships to the browser. Identity is separated from training data by opaque athlete ID — training tables never carry a name or email column.
- **No direct identifier reaches the LLM.** Name, email, DOB, and location are never sent to the Anthropic API (GDPR decision 1). Prompt builders assert this.
- **Colocate tests** with the code they test (`calc-load.ts` next to `calc-load.test.ts`).

### Definition of done

Product code (`src/`, `scripts/`, build config) is not done until all four pass:

    npm run lint          # eslint clean
    npx tsc --noEmit      # types clean
    npm test              # vitest green
    npm run build         # next build succeeds (for changes that affect the build)

Run them yourself and iterate against them before you call the work done — "looks done" is not a signal, a passing check is. Then run `/code-review` (the standing rule above) before committing or opening a PR. If a check fails and you are leaving it failing, say so plainly and why; a silently skipped check is the same failure mode as a silently skipped review.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Using the default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` at the repo root and `docs/adr/`. See `docs/agents/domain.md`.
