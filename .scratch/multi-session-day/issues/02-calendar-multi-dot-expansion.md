Status: closed-superseded

# 02 — Calendar: multiple dots and multi-session day expansion

> **Closed-superseded (2026-07-12), split absorption**: the inline day-expansion half dies with [Session Drawer replaces inline expansion](../../draggable-calendar/issues/03-session-drawer.md) (per-session actions live in the Drawer, opened per Session Block); the multi-dot half is absorbed into [Expanded Week, read-only](../../draggable-calendar/issues/02-expanded-week-read-only.md) as the reconciled dot spec (up to 5 dots, `+N` overflow at six or more, per-session styling, day complete = all rated). Ruling: [Map Multiple Sessions Per Day onto the entity store](../../calendar-implementation-route/issues/02-map-multi-session-day-onto-the-entity-store.md).

## Parent

`.scratch/multi-session-day/PRD.md`

## What to build

Update the Training Plan calendar to render multiple colour-coded dots for days with more than one session, and update the day expansion panel to show each session as a separate, independently-actionable sub-panel.

**Dot area:**
- A day cell currently renders a single dot. Update it to render one dot per session, laid out horizontally side by side.
- Each dot uses the existing colour coding by session type (Endurance=blue, Intensity=red, Tempo=amber, Recovery=green, Rest=grey) and the existing dot style logic (solid=completed, outline=planned, muted=skipped) applied per-session based on that session's individual feedback/skip status.
- Cap at 3 visible dots. If a day has more than 3 sessions, show 2 dots and a `+N` text indicator for the overflow count. This is a POC edge-case guard — realistic Ironman days will not exceed 3.
- Single-session days are visually unchanged.

**`buildWeekPlanMap`** in `calendar.js` — currently returns `dateKey → single session object`. Update to return `dateKey → session[]` (array). Update all consumers of this map accordingly.

**Day expansion panel:**
- Single-session days: expansion is visually unchanged from the current design.
- Multi-session days: show each session as a vertically-stacked sub-panel within the expansion. Each sub-panel contains:
  - Session type label (with its colour indicator)
  - Duration, zone, Coach note
  - Status badge (Planned / Completed / Skipped)
  - Action buttons: "Rate this session", "Mark as skipped", "Discuss with Coach" — scoped to that session
- Sub-panels are ordered by `sessionIndex` ascending.
- Only one day can be expanded at a time (existing behaviour, unchanged).

**`expandDay`** in `calendar.js` — currently builds a single session detail block. Update to iterate over an array of sessions for the day and render one sub-panel per session.

## Acceptance criteria

- [ ] A day with two sessions renders two dots side by side in their respective type colours
- [ ] Each dot reflects that session's individual completion status (e.g. first session completed=solid, second=outline)
- [ ] A day with three sessions renders three dots; a day with four renders two dots + "+2"
- [ ] Single-session days are visually unchanged
- [ ] Expanding a multi-session day shows one sub-panel per session in sessionIndex order
- [ ] Each sub-panel shows type, duration, zone, Coach note, status, and action buttons
- [ ] Action buttons in each sub-panel are scoped to that session (rating/skipping one does not affect the other)
- [ ] `buildWeekPlanMap` returns arrays; no consumer crashes on a single-element array

## Blocked by

`.scratch/multi-session-day/issues/01-data-model-session-array.md`
