# Sweep the tracker: statuses, missing PRD, example-feature

Label: wayfinder:task
Status: ready-for-agent
Blocked by: 01
Map: ../MAP.md

## Question

Every PRD in `.scratch/` says `Status: ready-for-agent`, including features whose child issues are all `done` (coach-constraint-memory, expert-feedback-poc-updates, rpe-color-coding, weekly-session-date, garmin-integration, mcq-onboarding, athlete-language, new-athlete-experience). Do:

1. For each feature, set the PRD status to reflect its issues (all done → `done`; mixed → leave `ready-for-agent` and note which remain).
2. `nav-training-plan` has 9 issues but no PRD.md — add a one-paragraph PRD stub linking the issues, or record why none is needed.
3. Delete `.scratch/example-feature/` (setup scaffolding, `needs-triage` since creation) — safe post-git-baseline.
4. Verify each `done` claim shallowly: does the feature visibly exist in the poc? Flag (don't fix) any issue marked done that looks unimplemented.
5. Surfaced by [Initialize git and commit the baseline](01-initialize-git-and-commit-baseline.md): `.claude/settings.local.json` is tracked in the baseline but is conventionally machine-local — decide untrack + gitignore, or keep tracked.

Resolution records the per-feature status table and any flagged discrepancies (those may graduate fog on the map).
