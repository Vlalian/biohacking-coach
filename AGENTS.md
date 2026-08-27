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
  so they are never checked out from `main`). A missing file makes the `@`-import
  silently no-op, so an agent can lose the domain language with no error — confirm
  they are present.

### Junction the tracker. Never copy it.

`.scratch/` and `docs/agents/` live in **one** place — the private docs repo at
`C:\Users\madsk\bc-docs` — and every clone and worktree reaches them through a
**junction**. They are the same directory, not a copy.

**Never restore them by copying.** A copy is a fork the moment either side is
written to, and the fork is silent: both sides look right, and the one that dies
is the one inside a worktree.

Before writing to a ticket, the map, or anything under `.scratch/`, confirm you
are writing to the real thing:

    (Get-Item .scratch -Force).LinkType     # must print: Junction

If it prints nothing, `.scratch` is a private copy. **Stop and say so** — do not
write to it, and do not delete it either; it may hold state that exists nowhere
else. Use `New-Session.ps1`, which junctions and then verifies, and refuses to
hand over a worktree whose links did not land.

**What earned this rule.** On 2026-08-26 the tracker was found forked into
**four** divergent copies: two clones with their own `.scratch` (219 and 154
files, both edited the same evening) and two worktrees with their own again.
`knowledge-oracle/02` read `planned` in one and `done — ingested live, 31
sources / 1,583 chunks` in another. The finished work was real; the record of it
lived only inside a worktree, and `git worktree remove` would have deleted it
without a word. Two divergent copies of `showable-version/MAP.md` existed, each
holding findings the other lacked.

The instruction that caused it used to sit in this very section — *"restore them
before working: copy them in from another working copy"*. It is recorded rather
than quietly deleted, because it was a reasonable instruction that solved the
wrong half of the problem: it restored the **content** and destroyed the
**identity**.

Tear down only with `Remove-Session.ps1`. It unlinks junctions before removing
anything, and refuses outright to delete a worktree whose `.scratch` is a real
directory.

## Working rules

### Only Mads starts a code review

`/code-review` is his to start. Do not run it on your own initiative, and do not treat it as a step on the way to a commit.

The reason is cadence, not distrust. The old rule put a review on every commit, which meant a review per task, and each one costs a session's worth of tokens — they were being started far too often to be worth what they cost. He wants several finished implementations gathered up first, then **one** review across the batch. That is what `/plan-afk` and `/build-afk` accumulate on the `afk/batch` branch.

So: finish the work, run the four checks below, commit, and **say plainly that it is built and unreviewed.** If you think a review is genuinely warranted on this particular change, say so in one sentence and leave the call to him.

*Changed 2026-08-19.* This section previously read "Run the `/code-review` skill on product code before committing it, and before opening a pull request" — Mads's standing instruction of 2026-07-16 — and is recorded rather than quietly deleted, because the old rule was the right instinct and only its frequency was wrong. There is no hook behind this one: it is an instruction, and it holds because agents follow it.

When he does run one: it applies to **code** — `src/`, `scripts/`, config that affects the build. Not tracker files, ADRs, PRDs, or issue markdown; reviewing prose with a code-review skill wastes a session and teaches everyone to ignore the rule. Fix what it finds, or say plainly why you are not fixing it. A review whose findings you skip silently is theatre.

CodeRabbit is the second pair of eyes, and also his call. It does **not** review automatically on this repo — under 10 stars it must be triggered with `@coderabbitai review`, so a green "CodeRabbit" check does not mean it looked.

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

Run them yourself and iterate against them before you call the work done — "looks done" is not a signal, a passing check is. Do **not** run `/code-review` afterwards — that is his to spend (the standing rule above); commit and say plainly that the work is unreviewed. If a check fails and you are leaving it failing, say so plainly and why; a silently skipped check is the same failure mode as a silently skipped review.

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
