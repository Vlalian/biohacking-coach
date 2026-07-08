Status: ready-for-agent

# 02 — Expanded Week, read-only

## Parent

`.scratch/draggable-calendar/PRD.md`

## What to build

Week rows in the Training Plan calendar toggle into Expanded Weeks: the row grows in place (accordion — the month grid stays one surface) and each day's dots become Session Blocks laid out under their day columns. Multiple weeks can be expanded simultaneously; a header control expands or collapses all weeks at once. Tapping an expanded week's row collapses it.

Session Blocks are read-only in this slice (no drag, no tap action yet): colour by Session Type, label with type and duration, status styling mirroring the dot language (solid completed, outline planned, muted skipped/unavailable). Rest sessions render as muted blocks — the first time Rest is visible in the calendar. Collapsed days with multiple sessions show multiple dots.

All new labels go through the translation layer (English + Danish).

## Acceptance criteria

- [ ] Tapping a week row expands it in place; tapping again collapses; other weeks unaffected
- [ ] Several weeks can be expanded at the same time
- [ ] Header toggle expands all / collapses all
- [ ] Blocks show correct colour, label, and status style for every session status, including Rest
- [ ] Days with multiple sessions show multiple dots collapsed and multiple blocks expanded
- [ ] DOM tests cover expansion toggling, the all-toggle, and block rendering per status
- [ ] Translation-key tests for new labels

## Blocked by

`.scratch/draggable-calendar/issues/01-sessions-become-entities.md`
