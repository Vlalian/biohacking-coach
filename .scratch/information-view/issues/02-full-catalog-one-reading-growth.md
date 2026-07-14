Status: done (2026-07-14)

# 02 — Full catalog with one-reading growth

## Parent

`.scratch/information-view/PRD.md`

## What to build

The Panel Catalog grows to the full parity set (~15 panels) across the four families, and the one-reading growth becomes demoable.

- **Form & Load**: Form Today (fatigue/fitness/form as three numbers), Race Countdown, Load History (fitness/fatigue/form curves + weekly TSS), Consistency (completed vs skipped per week)
- **Body & Mind**: Body & Mind Feedback (from issue 01), Check-in Signals (energy/sleep quality/mood/motivation), Sleep & Feeling
- **Volume**: Sport Split — Duration, Sport Split — Distance, Weekly Hours, Longest Workout, Weekly Work (kJ)
- **Peaks & Zones**: Time in Zones, Peak Power, Peak Heart Rate

The data provider fills out to feed all families. Wearable-dependent panels (zones, peaks) have no data in the `fresh` state — they must be absent there, present in `rich`. A prototype-banner control (POC convention, not an athlete-facing feature) switches the dataset state so the growth is demonstrable.

The prototype (git history) is the visual spec for each panel's chart form; exact rendering may improve but must stay data-only — no Pattern Insights, no interpretations.

## Acceptance criteria

- [ ] `rich` state renders all catalog panels; `fresh` renders the subset with readings (wearable-dependent panels absent, not empty)
- [ ] A visible count communicates the growth (e.g. "12 of 15 panels have a reading")
- [ ] Table-driven predicate tests cover every panel: false on empty, true on one reading
- [ ] Table-driven render tests: no `NaN`, no empty-state copy, sane output at one reading for every panel
- [ ] Prototype-banner control toggles between states without reload
- [ ] All new labels ship EN + DA keys; suite green

## Blocked by

`.scratch/information-view/issues/01-first-real-panel.md`
