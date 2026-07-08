# Initialize git and commit the baseline

Label: wayfinder:task
Status: done
Assignee: claude (Mads's session, 2026-07-08)
Resolved: 2026-07-08
Blocked by: (none)
Map: ../MAP.md

## Question

Execution ticket (decision already made on the map: git init approved, local only, no remote). Do:

1. `git init` at the repo root.
2. Write a root `.gitignore`: `node_modules/`, `.fallow/` caches (`cache.bin`), OS noise. Note `poc/.gitignore` already exists — reconcile rather than duplicate.
3. Initial commit of the whole project as the baseline — *before* any of the doc-truth tickets land, so their edits are reviewable diffs.

Record in the resolution: the baseline commit hash, what the root .gitignore excludes, and any surprises (e.g. files that clearly shouldn't be tracked).

Why it blocks the doc tickets: every subsequent fix should land as a tracked change, ending the hand-rolled deletion-log era.

## Resolution

Done 2026-07-08.

- **Baseline commit**: `4ae934a` on `master` — 158 files, 13,201 insertions. Verified zero files from `node_modules/` or `.fallow/` staged.
- **Root .gitignore** excludes: `node_modules/`, `.fallow/`, `*.log`, `.DS_Store`, `Thumbs.db`.
- **Correction to this ticket's premise**: `poc/.gitignore` does *not* exist — an earlier merged directory listing misattributed the root `.fallow/`'s own `.gitignore` (contents: `*`, self-ignoring) to `poc/`. Both `.fallow/` dirs self-ignore, and the root .gitignore excludes them anyway. Nothing to reconcile.
- **Surprise 1**: no git identity existed on this machine. Set **repo-local** (not global) `user.name "Mads Kilstrup"` / `user.email "madskilstrup@gmail.com"` — change with `git config user.name/user.email` if wrong.
- **Surprise 2**: `.claude/settings.local.json` is tracked in the baseline. It's conventionally machine-local; whether to untrack + gitignore it is a call for the tracker-sweep ticket or Mads.
- Local only, no remote, per the map's standing decision.
