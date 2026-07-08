# Sweep the tracker: statuses, missing PRD, example-feature

Label: wayfinder:task
Status: done
Assignee: claude (Mads's session, 2026-07-08)
Resolved: 2026-07-08
Blocked by: 01
Map: ../MAP.md

## Question

Every PRD in `.scratch/` says `Status: ready-for-agent`, including features whose child issues are all `done` (coach-constraint-memory, expert-feedback-poc-updates, rpe-color-coding, weekly-session-date, garmin-integration, mcq-onboarding, athlete-language, new-athlete-experience). Do:

1. For each feature, set the PRD status to reflect its issues (all done → `done`; mixed → leave `ready-for-agent` and note which remain).
2. `nav-training-plan` has 9 issues but no PRD.md — add a one-paragraph PRD stub linking the issues, or record why none is needed.
3. Delete `.scratch/example-feature/` (setup scaffolding, `needs-triage` since creation) — safe post-git-baseline.
4. Verify each `done` claim shallowly: does the feature visibly exist in the poc? Flag (don't fix) any issue marked done that looks unimplemented.
5. Surfaced by [Initialize git and commit the baseline](01-initialize-git-and-commit-baseline.md): `.claude/settings.local.json` is tracked in the baseline but is conventionally machine-local — decide untrack + gitignore, or keep tracked.

## Resolution

Done 2026-07-08. Per-feature status table after the sweep:

| Feature | Issues | PRD status |
|---|---|---|
| athlete-language | 2/2 done | **done** |
| coach-constraint-memory | 4/4 done | **done** |
| expert-feedback-poc-updates | 4/4 done | **done** |
| garmin-integration | 2/2 done | **done** |
| mcq-onboarding | 4/4 done | **done** |
| new-athlete-experience | 2/2 done | **done** |
| rpe-color-coding | 1/1 done | **done** |
| weekly-session-date | 2/2 done | **done** |
| nav-training-plan | 7 done, 2 future | **done** (PRD stub created; scope note covers the two deferred `future` issues) |
| draggable-calendar | 0/8 started | ready-for-agent (verified genuinely unimplemented — no drag code in poc) |
| multi-session-day | 0/4 started | ready-for-agent (verified — day still holds a single session) |
| mvp | umbrella PRD | ready-for-agent, untouched — it's the product spec, not a work batch; its status semantics are a product call, not a sweep call |

- **Stale-open flip**: nav-training-plan issues 01 (drawer) and 02 (view switching) were `ready-for-agent` but demonstrably implemented in `poc/public/js/app.js` — set to done with sweep comments. No stale-*done* issues found: every `done` claim shallow-verified against poc code (translations, constraints, RPE gradient, Garmin upload, onboarding, race-target prompt) checked out.
- **example-feature deleted** — setup scaffolding, preserved in the git baseline.
- **settings.local.json**: untracked (`git rm --cached`, file stays on disk) and added to .gitignore — conventional machine-local treatment.

Resolution records the per-feature status table and any flagged discrepancies (those may graduate fog on the map).
