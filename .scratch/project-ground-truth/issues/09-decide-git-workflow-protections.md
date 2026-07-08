# Decide git workflow protections

Label: wayfinder:grilling
Status: done
Assignee: claude (Mads's session, 2026-07-08)
Resolved: 2026-07-08
Blocked by: (none)
Map: ../MAP.md

## Question

Graduated from the map's fog by [Retire the hand-rolled deletion log](05-retire-hand-rolled-deletion-log.md): git now exists and carries real history, so losing it becomes possible. Grill Mads to a decision on:

- **Guardrails hooks** — the `git-guardrails-claude-code` skill can block destructive git commands (`push`, `reset --hard`, `clean`, `branch -D`) from agent sessions. Install for this repo?
- **Commit conventions** — the map's sessions have used `Resolve ticket: <name> (<map>)`; worth writing down as the convention, or leave free-form?
- **Backup** — history is local-only by design (no-remote is a standing decision). Is a periodic local backup (e.g. a bundle to another drive) wanted, or accepted risk?

Small decisions, one sitting. Resolution records each.

## Resolution

Decided by Mads, 2026-07-08:

- **Guardrails hooks: yes — installed** (project-level, via the git-guardrails-claude-code skill). `PreToolUse` hook at `.claude/hooks/block-dangerous-git.sh`, registered in `.claude/settings.json` for **both** the Bash and PowerShell tools (the bundled skill only matches Bash; PowerShell is this machine's primary shell, so a Bash-only hook would have been a paper guardrail). Blocks `git push` (incl. `--force`), `reset --hard`, `clean -f/-fd`, `branch -D`, `checkout .`, `restore .`. One machine-specific fix: `jq` isn't installed here, so the script silently passed everything — added a no-jq fallback that matches patterns against the raw hook input (over-broad in the safe direction). Verified: dangerous payload → exit 2 + BLOCKED, safe payload → exit 0, and the live harness demonstrably enforces it (it blocked this session's own test command containing the literal string "git push").
- **Commit convention: declined** — commits stay free-form.
- **Backup bundle: declined** — local-only history is accepted risk for now.
