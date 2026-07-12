Status: ready-for-agent
Route position: 4 of 8 (Calendar Implementation Route)

# 03 — Session Drawer replaces inline expansion

## Parent

`.scratch/draggable-calendar/PRD.md`

## What to build

Tapping a Session Block slides in the Session Drawer from the right — mirroring the Navigation Drawer's behavior (overlay, tap-outside or close dismisses). It becomes the single home for session detail; the inline calendar expansion (`cal-expansion`) and its planning-day panel are deleted.

Drawer content top-to-bottom per the glossary: header (Session Type in colour, status badge, full date), parameters (duration, zone), the Coach note, Session Reflection display with Rate/Edit, and actions (skip/undo, unavailable/undo, Discuss with Coach). Coach-authored content is read-only and never deletable. Opened from the planning-day marker, the drawer shows the Weekly Session call-to-action instead. All existing action behaviors (rating flow, skip/unavailable state changes, Discuss handoff to the Coach view) keep working from their new home.

**Absorbed from Multiple Sessions Per Day** (ruled 2026-07-09): the feedback modal header names the specific session's type ("Recovery — how did it go?"); the "Rate this session" banner button targets today's first session by `dayOrder`. On a multi-session day the drawer opens per Session Block — no sub-panels.

## Acceptance criteria

- [ ] Tapping a block opens the drawer with correct content for planned, completed, skipped, unavailable, and Rest sessions
- [ ] Rate/Edit opens the existing feedback prompt with the session's own type in the header; saved ratings appear in the drawer and calendar
- [ ] On a multi-session day each block opens its own drawer; the banner "Rate this session" button targets today's first session by `dayOrder`
- [ ] Skip/undo and unavailable/undo update store, drawer, blocks, and dots
- [ ] Discuss with Coach hands off to the Coach view with session context, as before
- [ ] Planning-day marker opens the drawer with the Start Weekly Session CTA and it works
- [ ] The inline expansion no longer exists anywhere in the calendar
- [ ] DOM tests cover drawer content per status/origin and action wiring; translation-key tests for new labels

## Blocked by

`.scratch/draggable-calendar/issues/02-expanded-week-read-only.md`
