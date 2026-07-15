Status: done (2026-07-15)

# 08 — Time-range selector

## Parent

`.scratch/information-view/PRD.md` (second mining pass, `.scratch/nav-training-plan/reference-app-review.md`)

## What to build

A range control on the Information View that governs every panel and the Comparison Graph: the athlete picks the window their data is read over.

- Ranges: last 4 weeks, last 12 weeks, all history (default: all). Custom dates deliberately out of scope for now.
- A pure windowing function narrows a dataset to the range (weekly, checkins, sessions, sleep, peaks all clipped consistently); panels and the Comparison Graph render from the windowed dataset. Nothing outside the data seam re-implements windowing.
- The one-reading rule applies within the window: a panel with no readings in the selected range does not render (consistent no-dead-panels behavior), and the reading count reflects the window.
- The selection is a lasting preference: persisted per user alongside the Favorites layout.
- Range labels ship EN + DA keys.

## Acceptance criteria

- [ ] Switching range re-renders all panels and the Comparison Graph from the windowed dataset; "all" matches today's behavior
- [ ] Pure windowing function covered by table-driven tests (clip boundaries, empty windows, window larger than history)
- [ ] A panel whose data lies entirely outside the window disappears; the reading count updates
- [ ] Selected range survives a reload; unknown stored values fall back to "all"
- [ ] EN + DA keys; suite green

## Blocked by

None — can start immediately.
