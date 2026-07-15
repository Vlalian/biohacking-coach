Status: done (2026-07-14) — SUPERSEDED 2026-07-15: Mads reviewed the built page and replaced Period Comparison with the **Comparison Graph** (athlete-composed: ⇄ adds any series-bearing panel's series to one large combined normalized chart; chips remove, Clear empties). The vs-previous-window overlay never reached a user; splitPeriods was removed with it. See CONTEXT.md → Comparison.

# 07 — Period Comparison

## Parent

`.scratch/information-view/PRD.md`

## What to build

The second Comparison form: a ⇄ toggle on compare-capable time-series panels overlays the previous equal-length period for visual comparison.

- Panels that declare period-compare capability in the Panel Catalog (Load History, Body & Mind Feedback, Sleep & Feeling, Weekly Hours) gain a ⇄ control in their header.
- Toggled on, the panel splits its dataset into the current window and the previous equal-length window, rendering the previous one dashed/muted behind the current, with a short explanatory note.
- The split math lives in the pure comparison-logic module (shared with issue 06): equal-length windows, correct behavior on odd lengths, and graceful degradation when there isn't enough history for a previous window (toggle renders current data only, no error).
- Toggle state is per-panel and does not persist across reloads (a viewing mode, not a layout preference).

## Acceptance criteria

- [ ] ⇄ appears only on compare-capable panels; toggling overlays the previous period dashed and toggling again returns to normal
- [ ] Period-split math covered by table-driven tests: even lengths, odd lengths, single-reading datasets, empty previous window
- [ ] In `fresh` state (insufficient history) the toggle degrades gracefully — current data renders, nothing breaks
- [ ] Toggle interaction tested in jsdom via exported handlers
- [ ] EN + DA keys for the control and note; suite green

## Blocked by

`.scratch/information-view/issues/02-full-catalog-one-reading-growth.md`
