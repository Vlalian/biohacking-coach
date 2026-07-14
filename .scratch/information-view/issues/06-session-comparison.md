Status: ready-for-agent

# 06 — Session Comparison

## Parent

`.scratch/information-view/PRD.md`

## What to build

The first Comparison form: pick completed sessions, see them side by side — with how they felt next to what was done.

- A "Compare sessions" affordance in the Information View opens an overlay with a picker: completed sessions listed newest-first, filterable by sport and by Session Type, each row showing date, title, sport, type, duration, TSS, and the Body/Mind ratings.
- Any sessions are selectable (guide, don't forbid — filters make same-kind comparison the natural path); comparing requires 2 or more.
- The comparison lays the selected sessions out as side-by-side columns: parameters (duration, distance, TSS, avg power/HR where present), outcomes, and always Body Feedback and Mind Feedback (RPE 1–10) plus the Session Reflection comment when present.
- A pure **comparison logic** module owns filtering, the 2+ selection rule, and attribute extraction; the overlay is thin.

## Acceptance criteria

- [ ] Picker lists only completed sessions; sport and Session Type filters compose; selection survives filter changes
- [ ] Compare is disabled below 2 selections and renders one column per selected session above that
- [ ] Body and Mind ratings appear in every comparison column; sessions without optional metrics (power/HR) omit those rows rather than showing blanks
- [ ] Pure-logic tests cover the filter matrix, selection threshold, and attribute extraction; overlay flow (open → select → compare → back → close) tested in jsdom via exported handlers
- [ ] EN + DA keys for all overlay labels; suite green

## Blocked by

`.scratch/information-view/issues/02-full-catalog-one-reading-growth.md`
