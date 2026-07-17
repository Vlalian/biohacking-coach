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
