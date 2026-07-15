Status: ready-for-agent

# 09 — Recent Bests feed

## Parent

`.scratch/information-view/PRD.md` (second mining pass, `.scratch/nav-training-plan/reference-app-review.md`)

## What to build

A new panel in the Peaks & Zones family: a chronological feed of the athlete's recent personal bests — the moments, not just the numbers. Pure Achievement Motivation.

- The synthetic data provider grows a `bests` collection: dated PB events (e.g. best 5-sec power, best 1-min HR, fastest synthetic run split), newest first, present in `rich`, absent in `fresh` (wearable-dependent).
- The panel lists recent bests with date, metric, value, and discipline icon/color — a feed, not a table. Capped to the most recent handful with the rest implied.
- One-reading rule as usual: no bests → no panel.
- Data stays data: no Coach commentary, no "congratulations" (celebration is the Coach's job in conversation, not the panel's).

## Acceptance criteria

- [ ] Panel renders in rich state as a newest-first dated list; absent in fresh state
- [ ] Provider determinism holds; bests satisfy shape invariants (date, metric label key, value, sport)
- [ ] One-reading predicate table row added; render sanity (no NaN) covered like every other panel
- [ ] EN + DA keys for the panel title and metric labels; suite green

## Blocked by

None — can start immediately. (Combines well with issue 08: bests respect the selected range.)
