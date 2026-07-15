Status: ready-for-agent

# 10 — Ramp-rate tiles

## Parent

`.scratch/information-view/PRD.md` (second mining pass, `.scratch/nav-training-plan/reference-app-review.md`)

## What to build

A new panel in the Form & Load family answering "am I building or fading?" at a glance: fitness change over the last 7, 28, 90, and 365 days as four small tiles, each with the delta as its headline number (signed, color-coded up/down/flat) and a small sparkline of the underlying fitness curve for that window.

- Derived purely from the weekly fitness series the provider already produces; windows larger than available history collapse gracefully (show what exists, omit tiles with no window — e.g. a fresh athlete sees only the 7-day tile).
- Data only: no interpretation, no "good/bad" labels — the sign and color are arithmetic, not judgment.

## Acceptance criteria

- [ ] Panel renders four tiles on rich data; fresh data shows only the tiles whose window has readings
- [ ] Delta math covered by table-driven tests (positive, negative, flat, window > history)
- [ ] One-reading predicate row + render sanity tests like every other panel
- [ ] EN + DA keys; suite green

## Blocked by

None — can start immediately. (Combines well with issue 08: tiles are anchored to now regardless of range, or clip to range — decide in build, note the choice.)
