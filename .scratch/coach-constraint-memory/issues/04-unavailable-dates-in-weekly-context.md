Status: done

# 04 — Unavailable Dates in Weekly Session Context

## Parent

`.scratch/coach-constraint-memory/PRD.md`

## What to build

Pass both fixed constraints and single-instance unavailable dates to the Weekly Session system prompt so the Coach incorporates them into the week plan without the athlete having to re-state them.

`buildWeeklyContext` receives:
- `fixedConstraints` from the athlete profile (array of day names)
- `unavailableDates` from localStorage for the upcoming week (array of ISO date strings marked as unavailable)

The Coach prompt includes both as a constraints block. The Coach uses them silently when proposing the week plan — it does not call them out unless the athlete asks.

## Acceptance criteria

- [ ] The Weekly Session system prompt includes a constraints block when `fixedConstraints` is non-empty
- [ ] The Weekly Session system prompt includes upcoming unavailable dates when any are stored in localStorage
- [ ] The Coach does not propose sessions on days listed in either constraint source
- [ ] The Coach does not surface the constraints conversationally unless the athlete asks about them
- [ ] An athlete with no constraints set sees no change in Coach behaviour

## Blocked by

`.scratch/coach-constraint-memory/issues/01-fixed-constraints-profile-and-prompt.md`
`.scratch/coach-constraint-memory/issues/02-manual-unavailable-marking-in-calendar.md`
