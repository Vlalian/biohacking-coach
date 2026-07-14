Status: done (2026-07-14). Note: the pointer gesture follows the Session Move pattern and is verified via the exported handler + live-module invocation; a by-hand drag in the browser is worth one manual pass (same caveat as the calendar's drag).

# 05 — Favorites drag-reorder

## Parent

`.scratch/information-view/PRD.md`

## What to build

The athlete drags entries within the rail's ★ Favorites group to reorder them; the feed follows, and the order persists through the layout store.

- Drag is scoped to the Favorites group only — family groups keep catalog order (their order is not a preference).
- Reordering goes through the layout store's pure reorder operation; persistence is the same `bh_`-prefixed key from issue 04.
- The pointer-drag interaction follows the Training Plan calendar's Session Move implementation pattern; the drop logic is exposed as an exported handler so tests never synthesize drag gestures.
- Dropping outside the Favorites group, onto a family entry, or onto itself is a no-op.

## Acceptance criteria

- [ ] Dragging a Favorites rail entry to a new position reorders both rail and feed
- [ ] New order survives reload
- [ ] Drops outside the ★ group (including onto family entries) change nothing
- [ ] Reorder logic covered by table-driven tests on the pure operation; DOM behavior via the exported drop handler in jsdom — no synthetic drag gestures
- [ ] Suite green

## Blocked by

`.scratch/information-view/issues/04-favorites-star-persistence.md`
