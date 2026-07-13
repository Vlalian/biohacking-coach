Status: done
Route position: 3 of 8 (Calendar Implementation Route)

# 02 — Expanded Week, read-only

## Parent

`.scratch/draggable-calendar/PRD.md`

## What to build

Week rows in the Training Plan calendar toggle into Expanded Weeks: the row grows in place (accordion — the month grid stays one surface) and each day's dots become Session Blocks laid out under their day columns. Multiple weeks can be expanded simultaneously; a header control expands or collapses all weeks at once. Tapping an expanded week's row collapses it.

Session Blocks are read-only in this slice (no drag, no tap action yet): colour by Session Type, label with type and duration, status styling mirroring the dot language (solid completed, outline planned, muted skipped/unavailable). Rest sessions render as muted blocks — the first time Rest is visible in the calendar.

**Reconciled multi-dot spec** (absorbed from Multiple Sessions Per Day, ruled 2026-07-09): a collapsed day shows up to **5 dots** side by side in type colours; six or more sessions show 4 dots + a `+N` overflow indicator. Dot style (solid/outline/muted) is per-session by its own status; a day is "complete" (all solid) only when every session on it is rated — mixed styles are normal.

All new labels go through the translation layer (English + Danish).

## Acceptance criteria

- [ ] Tapping a week row expands it in place; tapping again collapses; other weeks unaffected
- [ ] Several weeks can be expanded at the same time
- [ ] Header toggle expands all / collapses all
- [ ] Blocks show correct colour, label, and status style for every session status, including Rest
- [ ] Days with multiple sessions show multiple dots collapsed and multiple blocks expanded
- [ ] Per-session dot styling renders (e.g. one solid + one outline on the same day); six sessions render 4 dots + `+2`
- [ ] A day reads "complete" only when all its sessions are rated
- [ ] DOM tests cover expansion toggling, the all-toggle, and block rendering per status
- [ ] Translation-key tests for new labels

## Blocked by

`.scratch/draggable-calendar/issues/01-sessions-become-entities.md`

## Resolution

Implemented 2026-07-13 (commit cb08171); all acceptance criteria covered by tests, suite green.
