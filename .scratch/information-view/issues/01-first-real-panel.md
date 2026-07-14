Status: ready-for-agent

# 01 — First real panel on the page

## Parent

`.scratch/information-view/PRD.md`

## What to build

The tracer bullet: the real Information View module replaces the prototype, wired into the Navigation Drawer and View switcher, rendering ONE panel — Body & Mind Feedback — from a real synthetic-data seam.

Two modules are born here with their real shapes:

- **Synthetic data provider**: seeded, deterministic, exposing named dataset states `fresh` (week 1) and `rich` (26 weeks). Sessions with Body/Mind Feedback are the only data this issue strictly needs, but the provider's dataset shape should anticipate the full catalog (weekly aggregates, check-ins, sleep, peaks). All values synthetic — the 2026-07-09 privacy rule applies to fixtures too.
- **Panel Catalog**: a pure module where each Panel declares id, family, title, a one-reading predicate over a dataset, and a render function. One entry for now: Body & Mind Feedback (weekly Body and Mind averages as two lines, RPE 1–10). Panels show data, never Coach-derived interpretation.

The view module renders available panels as a plain single-column feed. The prototype module (`infoview.prototype.js`) and its wiring comments are deleted — git history and the prototype verdict in the parent PRD preserve the visual spec. All athlete-visible labels ship EN + DA translation keys.

## Acceptance criteria

- [ ] Opening Information from the Navigation Drawer renders the Body & Mind Feedback panel from provider data — no prototype code remains in the repo
- [ ] Provider is deterministic: requesting the same state twice yields identical data; `fresh` and `rich` both satisfy the dataset shape
- [ ] One-reading rule holds: the panel's predicate is false on an empty dataset, true with exactly one rated session; a false predicate means the panel does not render at all (no empty-state placeholder)
- [ ] Render output contains no `NaN` and renders correctly with a single reading (one dot, not a broken line)
- [ ] All labels resolve through EN + DA translation keys
- [ ] Existing test suite stays green; new tests cover provider determinism, the predicate table (empty/one/many), and render sanity

## Blocked by

None — can start immediately.
