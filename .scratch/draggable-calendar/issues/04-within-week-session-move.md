Status: ready-for-agent

# 04 — Within-week Session Move

## Parent

`.scratch/draggable-calendar/PRD.md`

## What to build

Dragging a Session Block to another day of the same Expanded Week performs a silent Session Move. This slice introduces the pure move-rules module (`classifyMove`, `resolveDrop` for the non-Rest cases, `needsCheckpoint` stub honest for within-week) and the thin orchestrator (classify → resolve → persist → log) that the drag UI calls.

Rules delivered here: completed sessions and everything in past weeks are frozen (not draggable); past days are never drop targets (the drop bounces); today is a valid target; fixed-constraint days are valid targets with no friction; moving a skipped or unavailable session resets it to planned (revival); training dropped on training forms a Double — unlimited, each session keeping its own identity, status, and rating. Every move lands in the silent move log. Drag is pointer-event based; drop handling is an exported function so tests can invoke it directly.

## Acceptance criteria

- [ ] Table-driven pure tests cover every within-week cell of the legality and conflict matrix
- [ ] Dragging planned/skipped/unavailable blocks between days of one week moves them; skipped/unavailable become planned
- [ ] Completed blocks and past-week blocks cannot be lifted; drops on past days bounce with no state change
- [ ] Two or more training sessions coexist on one day with independent status and rating (Double)
- [ ] Each move appends a log entry (session, from-day, to-day); nothing is surfaced to the athlete
- [ ] Orchestrator story tests: revival move, Double formation, bounce
- [ ] One-time manual browser check of the drag gesture (note in PR); DOM tests use the exported drop handler

## Blocked by

`.scratch/draggable-calendar/issues/02-expanded-week-read-only.md`
