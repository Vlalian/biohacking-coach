## Working rules

### Review code before committing it

Run the `/code-review` skill on product code before committing it, and before opening a pull request. Mads's standing instruction, 2026-07-16.

This applies to **code** — `src/`, `scripts/`, config that affects the build. It does not apply to tracker files, ADRs, PRDs, or issue markdown; reviewing prose with a code-review skill wastes a session and teaches you to ignore the rule.

Fix what the review finds, or say plainly why you are not fixing it. A review whose findings you skip silently is theatre.

This is an instruction, not an enforced hook: no hook can verify a skill ran, only that a command was typed. `.claude/hooks/block-dangerous-git.sh` is the enforced layer and it guards different things (force pushes, hard resets, bulk discards). Do not confuse the two — this one holds only because agents follow it.

CodeRabbit reviews every PR on GitHub as well. That is the second pair of eyes, not the first: it runs after the code is pushed, and the point of this rule is to not push work you already know is wrong.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Using the default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` at the repo root and `docs/adr/`. See `docs/agents/domain.md`.
