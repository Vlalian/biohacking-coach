# Initialize git and commit the baseline

Label: wayfinder:task
Status: ready-for-agent
Assignee: claude (Mads's session, 2026-07-08)
Blocked by: (none)
Map: ../MAP.md

## Question

Execution ticket (decision already made on the map: git init approved, local only, no remote). Do:

1. `git init` at the repo root.
2. Write a root `.gitignore`: `node_modules/`, `.fallow/` caches (`cache.bin`), OS noise. Note `poc/.gitignore` already exists — reconcile rather than duplicate.
3. Initial commit of the whole project as the baseline — *before* any of the doc-truth tickets land, so their edits are reviewable diffs.

Record in the resolution: the baseline commit hash, what the root .gitignore excludes, and any surprises (e.g. files that clearly shouldn't be tracked).

Why it blocks the doc tickets: every subsequent fix should land as a tracked change, ending the hand-rolled deletion-log era.
