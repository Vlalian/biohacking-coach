## Local context files (gitignored — read these first)

`CONTEXT.md` and `OVERVIEW.md` are **not in git**. They were removed from version
control when the repo went public (PR #24) and now live only on disk in each
working copy, alongside the read-on-demand `.scratch/`, `docs/`, and `poc/` corpus.
They remain the source of truth for this project's language and orientation.

**Read `CONTEXT.md` and `OVERVIEW.md` at the start of every session**, before
writing code or issues — `CONTEXT.md` is the domain glossary (use its terms
exactly, don't drift to synonyms) and `OVERVIEW.md` says where truth lives.
`docs/` and `.scratch/` are read on demand when a task calls for them.

- **Claude Code** loads them automatically: `CLAUDE.md` `@`-imports `CONTEXT.md`
  and `OVERVIEW.md`, so every Claude session already has them in context.
- **Other agents** (Copilot, Cursor, Codex) do not `@`-import — open and read the
  two files explicitly at session start.
- **A freshly-created worktree will not have these files** (they are gitignored,
  so they are never checked out from `main`). Restore them before working: copy
  them in from another working copy, or `git restore --source <pre-PR#24-commit> --
  CONTEXT.md OVERVIEW.md`. A missing file makes the `@`-import silently no-op, so an
  agent can lose the domain language with no error — confirm they are present.

## Working rules

### Do not run `/code-review` yourself — Mads does

**Never invoke the `/code-review` skill on your own initiative.** Mads runs it when he wants it. Standing instruction, 2026-08-19 — this **reverses** the 2026-07-16 rule that told agents to run it before every commit. That rule is gone, not merely relaxed; if you find it quoted somewhere else, that copy is stale.

Why it changed: the skill spawns parallel sub-agents and costs a session's worth of tokens. Whether to spend that on a given change is his call, not yours. An agent that reviews everything it touches is not being careful — it is spending someone else's budget by reflex.

What to do instead, when product code is ready:

- Say so plainly, and say the review has **not** been run. Do not let "done" imply "reviewed".
- Commit and push. Opening the PR is Mads's call, as always.
- If you have a specific reason to think a review would earn its keep here — the change is load-bearing, or you are genuinely unsure of it — say that in one sentence and let him decide. Do not run it, and do not ask twice.

If he does ask for one: fix what it finds, or say plainly why you are not fixing it. A review whose findings you skip silently is theatre.

This governs `/code-review` specifically, not ordinary care. The definition of done below is still yours to run, every time, unasked.

**Where this rule lives, and why that matters.** The `mattpocock-skills:implement` skill ends with "use /code-review to review the work". That file sits in the plugin cache (`~/.claude/plugins/cache/…/<version>/`), and **a plugin update overwrites it** — an edit there is not durable. This file is: it is checked into git and loads into every session through `CLAUDE.md`. Where the two disagree, **this file wins.**

There is also a local enforced layer, `.claude/hooks/block-review-skill.sh`, which refuses the tool call outright. Note the asymmetry with what the old rule observed — that "no hook can verify a skill ran". True, and the mirror image is still enforceable: a hook cannot prove a review happened, but it can certainly stop one from starting. `.claude/` is gitignored, so that hook exists only where it has been set up; this file is the part that travels.

CodeRabbit still reviews PRs on GitHub, on request (`@coderabbitai review`).

### One worktree per implementation session

An implementation session gets its own **git worktree**, not just its own branch. Mads's standing instruction, 2026-07-16.

    git worktree add ../biohacking-coach-<slice> -b build/<NN>-<slug>

Then work in that directory. Claude Code can do this directly: agents take `isolation: "worktree"`, and there is an `EnterWorktree` tool.

**A branch is not isolation.** Every session in this directory shares one `.git` and one working tree, and the current branch is a single file — `.git/HEAD`. Running `git checkout -b` moves *every* session in the directory onto the new branch, mid-work, without telling them. On 2026-07-16 that happened three times: commits from a parallel session landed on branches it never chose, and a review had to be re-scoped to isolate one session's work from another's. The branching *caused* it.

Rules that follow:

- Do not `git checkout` or `git checkout -b` in the shared directory while another session may be working. Check for recent file mtimes first; if another session is live, use a worktree or wait.
- Never `git add -A` when a parallel session has uncommitted work — you will commit theirs as yours. Stage the specific files you changed.
- If you find uncommitted work you did not write, stop and surface it. Do not commit it, do not revert it.

### Session helper scripts (Windows)

Because the domain docs are gitignored (see the section above), a bare `git worktree add`
gives a session the code but **not** `CONTEXT.md`, `OVERVIEW.md`, or the `.scratch/`,
`docs/`, `poc/` corpus. Two PowerShell scripts in the main folder bridge that — they keep
**one** canonical copy of the docs and link it into each session:

- **`New-Session.ps1 -Name <slug> -Branch build/<NN>-<slug>`** — creates the worktree off
  `origin/main`, junctions the doc folders back to the canonical copies (admin-free on
  Windows), and writes a gitignored `CLAUDE.md` that `@`-imports `CONTEXT.md`/`OVERVIEW.md`/
  `AGENTS.md` by absolute path. Every session starts from the same ground truth, and doc
  edits land on the one real copy.
- **`Remove-Session.ps1 -Name <slug>`** — tears the session down. It **unlinks the junctions
  first**, then removes the worktree. This matters: a plain `git worktree remove` can follow
  the junctions and delete the canonical docs — always tear down with this script.

Run both from the main folder. The junctions and generated `CLAUDE.md` are gitignored, so
they never enter a PR.

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

Run them yourself and iterate against them before you call the work done — "looks done" is not a signal, a passing check is. If a check fails and you are leaving it failing, say so plainly and why; a silently skipped check is the worst kind, because it looks exactly like a passed one.

These four are yours, unasked, every time. `/code-review` is **not** among them — see the rule above: you never start that one, Mads does.
### Check a document's claim about the code against the code

When a tracker file, ADR, or decision log states something factual about the code — "X never happens", "**Where enforced:** `some/file.js`", "this table carries no name column" — **read the code before you repeat it.** Mads's standing instruction, 2026-07-17.

The claim to distrust most is the one naming its own enforcement point, because that is the one everybody downstream relies on.

**What earned this rule.** `gdpr-decisions.md` decision 1 said the athlete's name "is **never sent to the Anthropic API**", and named the enforcement point: "`poc/server.js` — all `buildCoachContext`, `buildWeeklyContext`, and `buildChatPrompt` functions." All of it false, and false from the start:

- `poc/public/index.html` has a settings field labelled **Name**, placeholder **"Your name"**.
- `app.js` stores it as `profile.personaName`.
- `buildWeeklyContext` — a named enforcement point — passes `personaName` straight through.
- `renderWeeklyPrompt` interpolates it: `` `…pulse=${pulse}bpm${personaName ? ` athlete=${personaName}` : ''}` ``.

So the app asked the athlete for their real name and sent it to Anthropic. The Coach Chat prompt's "Never use or reference the athlete's real name" is not a control either — it asks the model to ignore a name we just handed it.

On 2026-07-17 that false sentence was repeated into **four documents in one session** — a route ticket, a decision log, the map, and a build slice — while ruling a GDPR posture that *leaned on it*. Nobody had looked. The same session had already closed [route tickets 06, 07 and 08](.scratch/coach-eval-mvp-route/), all three of which were documents disagreeing with code. That is three warnings and a fourth incident.

Rules that follow:

- **Before repeating a factual claim about the code, grep for it.** It costs seconds. Being wrong costs a consent artifact that lies to a third party.
- **A "Where enforced" line is a hypothesis, not a citation.** Open the function.
- **An instruction in a system prompt is not a control.** If the model must not use a value, do not send it.
- **When a document and the code disagree, the code is what is true.** Fix the document, and say plainly that it was wrong rather than quietly editing it — the record of what was believed is worth keeping.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Using the default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` at the repo root and `docs/adr/`. See `docs/agents/domain.md`.
